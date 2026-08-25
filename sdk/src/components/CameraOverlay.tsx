import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";

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

export interface CameraOverlayProps {
  /**
   * When true, overlay is shown and camera start is attempted.
   * FaceAuthSDK / Mendix should toggle this for the auth session only.
   */
  open: boolean;

  /** Optional shared manager; if omitted, overlay owns a private instance. */
  cameraManager?: CameraManagerApi;

  /**
   * Optional start preferences. Omit for default behavior: any available
   * video device (`video: true`, `audio: false`). Do not require a fixed deviceId.
   */
  startOptions?: CameraStartOptions;

  /** Called after camera has been stopped/cleaned and overlay should dismiss. */
  onClose?: () => void;

  /** Notifies host of lifecycle/error changes without exposing MediaStream details. */
  onSnapshotChange?: (snapshot: CameraSessionSnapshot) => void;

  /** Optional instruction line under the preview (liveness copy comes later). */
  instruction?: string;

  /** Accessible title for the dialog-like overlay. */
  title?: string;
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
 * SDK-owned fullscreen camera UI.
 *
 * Mendix / test-harness do not implement their own camera page.
 * They open this overlay; the overlay owns preview binding and cleanup.
 *
 * Non-goals for this phase:
 * - Blink / liveness prompts beyond a static instruction
 * - Frame burst capture
 * - Calling the authentication API
 */
export function CameraOverlay({
  open,
  cameraManager,
  startOptions,
  onClose,
  onSnapshotChange,
  instruction = "Look at the camera",
  title = "Face authentication",
}: CameraOverlayProps): ReactElement | null {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ownedManagerRef = useRef<CameraManager | null>(null);
  const managerRef = useRef<CameraManagerApi | null>(null);
  const startOptionsRef = useRef(startOptions);
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  const [view, setView] = useState<OverlayViewState>(INITIAL_VIEW);

  startOptionsRef.current = startOptions;
  onSnapshotChangeRef.current = onSnapshotChange;

  if (!managerRef.current) {
    if (cameraManager) {
      managerRef.current = cameraManager;
    } else {
      ownedManagerRef.current = createCameraManager();
      managerRef.current = ownedManagerRef.current;
    }
  }

  const manager = managerRef.current;

  // Subscribe + mirror snapshot to React state / host callbacks.
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

    const unsubscribe = manager.subscribe((event) => {
      applySnapshot(event.snapshot);
    });

    return unsubscribe;
  }, [open, manager]);

  // Start camera when opened; always cleanup when closed or unmounted.
  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        await manager.start(startOptionsRef.current);
      } catch {
        // Typed error is already on manager.snapshot / events.
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
  }, [open, manager]);

  // Bind MediaStream to the <video> element whenever it becomes available.
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
        void video.play().catch(() => {
          // Autoplay can fail briefly during permission transitions; preview
          // still binds when the track becomes live.
        });
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

  // Drop privately owned manager only when this overlay instance unmounts.
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
  const canClose = !view.isBusy || view.status === "error";

  const handleClose = () => {
    void (async () => {
      await manager.cleanup();
      onClose?.();
    })();
  };

  return (
    <div
      style={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-camera-status={view.status}
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

          {view.status !== "active" && (
            <div style={styles.banner} data-testid="camera-status-banner">
              {statusLabel}
            </div>
          )}
        </div>

        <p style={styles.instruction}>{instruction}</p>

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
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.72)",
    padding: 16,
    boxSizing: "border-box",
  },
  panel: {
    width: "min(720px, 100%)",
    background: "#111827",
    color: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 12,
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
  },
  closeButton: {
    border: "1px solid #4b5563",
    background: "#1f2937",
    color: "#f9fafb",
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
  },
  instruction: {
    margin: 0,
    textAlign: "center",
    fontSize: 15,
    color: "#e5e7eb",
  },
  error: {
    margin: 0,
    textAlign: "center",
    fontSize: 14,
    color: "#fca5a5",
  },
};
