import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";

import {
  createBurstCapture,
  POST_BLINK_CAPTURE,
  type CapturedFrame,
} from "../camera/BurstCapture";
import {
  createCameraManager,
  type CameraManager,
} from "../camera/CameraManager";
import type {
  CameraError,
  CameraManagerApi,
  CameraSessionSnapshot,
  CameraStartOptions,
  CameraStatus,
} from "../camera/camera.types";
import {
  createBlinkDetector,
  createMediaPipeFaceDetectorSource,
  createMediaPipeFaceLandmarkerSource,
  KIOSK_LIGHT_BLINK,
  type BlinkDetector,
  type FaceLandmarkSource,
  type FacePresenceSource,
} from "../liveness/BlinkDetector";
import type {
  CapturePhase,
  FaceCaptureFailure,
  FaceCaptureResult,
} from "../types/auth.types";
import { CaptureStatus } from "./CaptureStatus";
import { BRAND, BRAND_DERIVED, overlayShellStyles } from "../ui/brandTheme";

export interface CameraOverlayProps {
  open: boolean;
  cameraManager?: CameraManagerApi;
  startOptions?: CameraStartOptions;
  onClose?: () => void;
  onSnapshotChange?: (snapshot: CameraSessionSnapshot) => void;
  /**
   * When true, runs: face present → blink → burst → onCaptureComplete → close.
   * Mendix production path uses FaceAuthSDK.captureFace() which enables this.
   */
  enableCapturePipeline?: boolean;
  onCaptureComplete?: (result: FaceCaptureResult) => void;
  onCaptureError?: (failure: FaceCaptureFailure) => void;
  onPhaseChange?: (phase: CapturePhase) => void;
  title?: string;
  /** Max ms to wait for a face before failing. */
  faceTimeoutMs?: number;
  /** Max ms for blink after face is found. */
  blinkTimeoutMs?: number;
}

interface OverlayViewState {
  status: CameraStatus;
  error: CameraError | null;
  isBusy: boolean;
}

const INITIAL_VIEW: OverlayViewState = {
  status: "idle",
  error: null,
  isBusy: false,
};

/**
 * SDK-owned camera UI for Mendix / test-harness.
 * Host apps never implement camera pages — they call FaceAuthSDK only.
 */
export function CameraOverlay({
  open,
  cameraManager,
  startOptions,
  onClose,
  onSnapshotChange,
  enableCapturePipeline = false,
  onCaptureComplete,
  onCaptureError,
  onPhaseChange,
  title = "Face authentication",
  faceTimeoutMs = 10_000,
  blinkTimeoutMs = 10_000,
}: CameraOverlayProps): ReactElement | null {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ownedManagerRef = useRef<CameraManager | null>(null);
  const managerRef = useRef<CameraManagerApi | null>(null);
  const startOptionsRef = useRef(startOptions);
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  const onCaptureCompleteRef = useRef(onCaptureComplete);
  const onCaptureErrorRef = useRef(onCaptureError);
  const onPhaseChangeRef = useRef(onPhaseChange);
  const onCloseRef = useRef(onClose);

  const [view, setView] = useState<OverlayViewState>(INITIAL_VIEW);
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [phaseMessage, setPhaseMessage] = useState<string | undefined>();
  const phaseRef = useRef<CapturePhase>("idle");

  startOptionsRef.current = startOptions;
  onSnapshotChangeRef.current = onSnapshotChange;
  onCaptureCompleteRef.current = onCaptureComplete;
  onCaptureErrorRef.current = onCaptureError;
  onPhaseChangeRef.current = onPhaseChange;
  onCloseRef.current = onClose;

  if (!managerRef.current) {
    if (cameraManager) {
      managerRef.current = cameraManager;
    } else {
      ownedManagerRef.current = createCameraManager();
      managerRef.current = ownedManagerRef.current;
    }
  }

  const manager = managerRef.current;

  const updatePhase = (next: CapturePhase, message?: string) => {
    if (phaseRef.current === next && message === undefined) {
      return;
    }
    phaseRef.current = next;
    setPhase(next);
    if (message !== undefined) {
      setPhaseMessage(message);
    }
    onPhaseChangeRef.current?.(next);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const applySnapshot = (snapshot: CameraSessionSnapshot) => {
      setView({
        status: snapshot.status,
        error: snapshot.error,
        isBusy:
          snapshot.status === "requesting_permission" ||
          snapshot.status === "starting" ||
          snapshot.status === "stopping",
      });
      onSnapshotChangeRef.current?.(snapshot);
    };

    applySnapshot(manager.snapshot);
    return manager.subscribe((event) => applySnapshot(event.snapshot));
  }, [open, manager]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    updatePhase("starting_camera");

    const run = async () => {
      try {
        await manager.start(startOptionsRef.current);
      } catch {
        if (!cancelled && enableCapturePipeline) {
          const message =
            manager.snapshot.error?.message ?? "Camera failed to start.";
          updatePhase("error", message);
          onCaptureErrorRef.current?.({
            code: "CAMERA_FAILED",
            message,
            phase: "error",
          });
          await manager.cleanup();
          onCloseRef.current?.();
        }
      }
      if (cancelled) {
        await manager.cleanup();
      }
    };

    void run();

    return () => {
      cancelled = true;
      void manager.cleanup();
    };
    // enableCapturePipeline intentionally read for error path only at start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, manager]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    const bind = (stream: MediaStream | null) => {
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      if (stream) {
        void video.play().catch(() => undefined);
      }
    };

    bind(manager.snapshot.stream);
    const unsubscribe = manager.subscribe((event) => {
      bind(event.snapshot.stream);
    });

    return () => {
      unsubscribe();
      video.srcObject = null;
    };
  }, [open, manager]);

  // Capture pipeline: fast face detect → blink → burst → complete → close
  useEffect(() => {
    if (!open || !enableCapturePipeline) {
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let presence: FacePresenceSource | null = null;
    let landmarker: FaceLandmarkSource | null = null;
    let blink: BlinkDetector | null = null;
    let faceSeen = false;
    let blinkStarted = false;
    let finishing = false;
    let modelsReady: Promise<void> | null = null;
    const startedAt = Date.now();

    const fail = (failure: FaceCaptureFailure) => {
      if (cancelled || finishing) {
        return;
      }
      finishing = true;
      updatePhase("error", failure.message);
      onCaptureErrorRef.current?.(failure);
      void manager.cleanup().finally(() => onCloseRef.current?.());
    };

    const succeed = (frame: CapturedFrame, framesConsidered: number) => {
      if (cancelled || finishing) {
        return;
      }
      finishing = true;
      const result: FaceCaptureResult = {
        blob: frame.blob,
        dataUrl: frame.dataUrl,
        width: frame.width,
        height: frame.height,
        mimeType: "image/jpeg",
        capturedAt: frame.capturedAt,
        framesConsidered,
      };
      updatePhase("completed", "Capture complete");
      onCaptureCompleteRef.current?.(result);
      void manager.cleanup().finally(() => onCloseRef.current?.());
    };

    // Preload BlazeFace + mesh while camera starts (biggest latency win).
    modelsReady = (async () => {
      const [presenceSource, meshSource] = await Promise.all([
        createMediaPipeFaceDetectorSource({
          minDetectionConfidence: 0.35,
        }),
        createMediaPipeFaceLandmarkerSource({
          minFaceDetectionConfidence: 0.35,
          minFacePresenceConfidence: 0.35,
        }),
      ]);
      if (cancelled) {
        presenceSource.close();
        meshSource.close();
        return;
      }
      presence = presenceSource;
      landmarker = meshSource;
      blink = createBlinkDetector({
        ...KIOSK_LIGHT_BLINK,
        timeoutMs: blinkTimeoutMs,
      });
    })().catch((error: unknown) => {
      if (!cancelled) {
        fail({
          code: "BLINK_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to start face detection models.",
          phase: "error",
        });
      }
    });

    const tick = async () => {
      if (cancelled || finishing) {
        return;
      }

      const video = videoRef.current;
      if (
        !video ||
        manager.snapshot.status !== "active" ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        rafId = window.requestAnimationFrame(() => {
          void tick();
        });
        return;
      }

      if (modelsReady) {
        await modelsReady;
        modelsReady = null;
      }
      if (cancelled || finishing || !presence || !landmarker || !blink) {
        return;
      }

      if (!faceSeen && Date.now() - startedAt > faceTimeoutMs) {
        fail({
          code: "FACE_TIMEOUT",
          message: "No face detected in time. Please look at the camera.",
          phase: "error",
        });
        return;
      }

      try {
        // Fast path: BlazeFace presence only until a face is locked.
        if (!faceSeen) {
          if (phaseRef.current !== "searching_face") {
            updatePhase("searching_face", "Look at the camera");
          }
          const faceCount = await presence.countFaces(video);
          if (cancelled || finishing) {
            return;
          }
          if (faceCount === 1) {
            faceSeen = true;
            // Minimal liveness: one blink only — skip dwelling on face_detected.
            blinkStarted = true;
            blink.start({ reset: true });
            updatePhase("blink_prompt", "Blink once");
          } else if (faceCount > 1) {
            updatePhase("searching_face", "Only one face should be in frame");
          }
        } else {
          // Mesh + EAR only after face is present (single blink).
          const faces = await landmarker.detect(video);
          if (cancelled || finishing) {
            return;
          }

          if (faces.length === 0) {
            if (phaseRef.current !== "searching_face") {
              updatePhase("searching_face", "Keep your face in view");
            }
            rafId = window.requestAnimationFrame(() => {
              void tick();
            });
            return;
          }

          if (faces.length > 1) {
            updatePhase("searching_face", "Only one face should be in frame");
            rafId = window.requestAnimationFrame(() => {
              void tick();
            });
            return;
          }

          if (!blinkStarted) {
            blinkStarted = true;
            blink.start({ reset: true });
            updatePhase("blink_prompt", "Blink once");
          }

          const sample = blink.processLandmarks(faces);

          if (sample.phase === "timed_out") {
            fail({
              code: "BLINK_TIMEOUT",
              message: "Blink not detected in time. Please try again.",
              phase: "error",
            });
            return;
          }

          if (sample.phase === "blink_confirmed") {
            // Light blink gate only — quality comes from best-frame pick for embedding.
            updatePhase("capturing", "Selecting best frame…");
            try {
              const burst = createBurstCapture();
              const { bestFrame, framesConsidered } = await burst.capture(
                video,
                POST_BLINK_CAPTURE,
              );
              succeed(bestFrame, framesConsidered);
            } catch (error) {
              fail({
                code: "CAPTURE_FAILED",
                message:
                  error instanceof Error
                    ? error.message
                    : "Failed to capture face frame.",
                phase: "error",
              });
            }
            return;
          }
        }
      } catch (error) {
        fail({
          code: "UNKNOWN",
          message:
            error instanceof Error ? error.message : "Capture pipeline failed.",
          phase: "error",
        });
        return;
      }

      rafId = window.requestAnimationFrame(() => {
        void tick();
      });
    };

    updatePhase("searching_face", "Look at the camera");
    rafId = window.requestAnimationFrame(() => {
      void tick();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      blink?.stop();
      void presence?.close();
      void landmarker?.close();
    };
  }, [
    open,
    enableCapturePipeline,
    manager,
    faceTimeoutMs,
    blinkTimeoutMs,
  ]);

  useEffect(() => {
    return () => {
      const owned = ownedManagerRef.current;
      if (owned) {
        void owned.cleanup();
        ownedManagerRef.current = null;
      }
      managerRef.current = null;
    };
  }, []);

  if (!open) {
    return null;
  }

  const statusLabel = resolveStatusLabel(view.status, view.error);
  const showCameraBanner = view.status !== "active";
  const canClose = !view.isBusy || view.status === "error" || phase === "error";

  const handleClose = () => {
    if (enableCapturePipeline) {
      onCaptureErrorRef.current?.({
        code: "CANCELLED",
        message: "Capture cancelled.",
        phase: "cancelled",
      });
    }
    void (async () => {
      await manager.cleanup();
      onCloseRef.current?.();
    })();
  };

  return (
    <div
      style={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-camera-status={view.status}
      data-capture-phase={phase}
    >
      <div style={styles.panel}>
        <header style={styles.header}>
          <h2 style={styles.title}>{title}</h2>
          <button
            type="button"
            style={styles.closeButton}
            onClick={handleClose}
            disabled={!canClose && view.status !== "error"}
            aria-label="Close camera"
          >
            Close
          </button>
        </header>

        <div style={styles.stage}>
          <video
            ref={videoRef}
            style={styles.video}
            autoPlay
            playsInline
            muted
            aria-label="Live camera preview"
          />

          {showCameraBanner && (
            <div style={styles.banner} data-testid="camera-status-banner">
              {statusLabel}
            </div>
          )}
        </div>

        {enableCapturePipeline ? (
          <CaptureStatus phase={phase} message={phaseMessage} />
        ) : (
          <p style={styles.instruction}>Look at the camera</p>
        )}

        {view.error && (
          <p style={styles.error} role="alert">
            {view.error.message}
            {view.error.retryable ? " You can try again." : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function resolveStatusLabel(
  status: CameraStatus,
  error: CameraError | null,
): string {
  switch (status) {
    case "requesting_permission":
      return "Requesting camera permission…";
    case "starting":
      return "Starting camera…";
    case "stopping":
      return "Stopping camera…";
    case "stopped":
      return "Camera stopped";
    case "error":
      return error?.message ?? "Camera error";
    case "idle":
      return "Preparing camera…";
    case "active":
      return "Camera active";
    default:
      return "Camera";
  }
}

const styles: Record<string, CSSProperties> = {
  root: overlayShellStyles.root,
  panel: {
    ...overlayShellStyles.panel,
    width: "min(720px, 100%)",
    padding: 16,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: BRAND.text,
  },
  closeButton: {
    border: `1px solid ${BRAND.border}`,
    background: BRAND_DERIVED.panel,
    color: BRAND.text,
    borderRadius: 8,
    padding: "8px 12px",
    cursor: "pointer",
  },
  stage: {
    position: "relative",
    width: "100%",
    aspectRatio: "4 / 3",
    background: "#000",
    borderRadius: 8,
    overflow: "hidden",
    border: `1px solid ${BRAND.border}`,
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: "scaleX(-1)",
  },
  banner: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.55)",
    padding: 16,
    textAlign: "center",
    fontSize: 16,
    color: "#ffffff",
  },
  instruction: {
    margin: 0,
    textAlign: "center",
    fontSize: 15,
    color: BRAND_DERIVED.textMuted,
  },
  error: {
    margin: 0,
    textAlign: "center",
    fontSize: 14,
    color: "#b91c1c",
  },
};
