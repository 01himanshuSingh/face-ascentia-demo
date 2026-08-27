/**
 * Blink / liveness foundation for the Face Authentication SDK.
 *
 * Architecture (scalable for production kiosks):
 *
 *   CameraManager MediaStream / <video>
 *           ↓
 *   FaceLandmarkSource (MediaPipe Face Landmarker, or future provider)
 *           ↓
 *   BlinkDetector (EAR state machine — provider-agnostic)
 *           ↓
 *   FaceAuthSDK / CameraOverlay (prompt "Please blink", then capture)
 *
 * Design rules:
 * - BlinkDetector never owns the camera (CameraManager does).
 * - BlinkDetector never talks to the backend (auth decision stays server-side).
 * - Landmark provider is swappable so MediaPipe can be upgraded without
 *   rewriting the blink state machine.
 * - Thresholds are configurable for lighting / camera / population tuning.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Normalized landmark in image space (MediaPipe-style 0..1 unless noted). */
export interface FaceLandmark {
  x: number;
  y: number;
  z?: number;
}

export type BlinkPhase =
  | "idle"
  | "waiting_for_face"
  | "eyes_open"
  | "eyes_closing"
  | "eyes_closed"
  | "eyes_opening"
  | "blink_confirmed"
  | "timed_out"
  | "error";

export type BlinkErrorCode =
  | "NO_FACE"
  | "MULTIPLE_FACES"
  | "LANDMARKS_UNSTABLE"
  | "PROVIDER_FAILED"
  | "TIMEOUT"
  | "NOT_STARTED"
  | "ALREADY_ACTIVE"
  | "UNKNOWN";

export interface BlinkError {
  code: BlinkErrorCode;
  message: string;
  retryable: boolean;
}

export interface BlinkDetectorConfig {
  /** EAR below this counts as closed. Typical range ~0.15–0.22. */
  earCloseThreshold?: number;
  /** EAR above this counts as open again after a close. */
  earOpenThreshold?: number;
  /** Min consecutive closed frames before a blink is counted. */
  minClosedFrames?: number;
  /** Min consecutive open frames required before/after the closed streak. */
  minOpenFrames?: number;
  /** How many confirmed close→open cycles are required (usually 1). */
  requiredBlinks?: number;
  /** Session timeout in ms (0 = no timeout). */
  timeoutMs?: number;
  /**
   * Minimum face landmark count expected from the mesh provider.
   * MediaPipe Face Landmarker (full) provides 478 points.
   */
  minLandmarkCount?: number;
}

export interface EyeMetrics {
  leftEar: number;
  rightEar: number;
  /** Average of both eyes — primary blink signal. */
  ear: number;
}

export interface BlinkSample {
  timestamp: number;
  metrics: EyeMetrics | null;
  faceDetected: boolean;
  phase: BlinkPhase;
  blinksDetected: number;
  requiredBlinks: number;
  progress: number;
  error: BlinkError | null;
}

export type BlinkEventType =
  | "sample"
  | "phase_changed"
  | "blink_progress"
  | "blink_confirmed"
  | "timeout"
  | "error"
  | "reset";

export interface BlinkSampleEvent {
  type: "sample";
  sample: BlinkSample;
}

export interface BlinkPhaseChangedEvent {
  type: "phase_changed";
  previous: BlinkPhase;
  current: BlinkPhase;
  sample: BlinkSample;
}

export interface BlinkProgressEvent {
  type: "blink_progress";
  blinksDetected: number;
  requiredBlinks: number;
  sample: BlinkSample;
}

export interface BlinkConfirmedEvent {
  type: "blink_confirmed";
  sample: BlinkSample;
}

export interface BlinkTimeoutEvent {
  type: "timeout";
  sample: BlinkSample;
}

export interface BlinkErrorEvent {
  type: "error";
  error: BlinkError;
  sample: BlinkSample;
}

export interface BlinkResetEvent {
  type: "reset";
  sample: BlinkSample;
}

export type BlinkEvent =
  | BlinkSampleEvent
  | BlinkPhaseChangedEvent
  | BlinkProgressEvent
  | BlinkConfirmedEvent
  | BlinkTimeoutEvent
  | BlinkErrorEvent
  | BlinkResetEvent;

export type BlinkEventListener = (event: BlinkEvent) => void;

/**
 * Landmark provider contract — MediaPipe today, another mesh model later.
 */
export interface FaceLandmarkSource {
  readonly name: string;
  detect(input: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<FaceLandmark[][]>;
  close(): Promise<void> | void;
}

export interface BlinkDetectorApi {
  readonly sample: BlinkSample;
  start(options?: { reset?: boolean }): void;
  stop(): void;
  reset(): void;
  /**
   * Feed landmarks from any provider (unit-testable without MediaPipe).
   * Pass [] / empty when no face is present.
   */
  processLandmarks(faces: FaceLandmark[][], timestampMs?: number): BlinkSample;
  subscribe(listener: BlinkEventListener): () => void;
}

// ---------------------------------------------------------------------------
// MediaPipe Face Mesh eye indices (Face Landmarker / Face Mesh topology)
// ---------------------------------------------------------------------------

/**
 * Six-point eye contours used for Eye Aspect Ratio (EAR).
 * Compatible with MediaPipe 468/478 face mesh topology.
 */
export const MEDIAPIPE_LEFT_EYE_EAR_INDICES = [
  33, 160, 158, 133, 153, 144,
] as const;

export const MEDIAPIPE_RIGHT_EYE_EAR_INDICES = [
  362, 385, 387, 263, 373, 380,
] as const;

const DEFAULT_CONFIG: Required<BlinkDetectorConfig> = {
  earCloseThreshold: 0.19,
  earOpenThreshold: 0.23,
  minClosedFrames: 2,
  minOpenFrames: 2,
  requiredBlinks: 1,
  timeoutMs: 15_000,
  minLandmarkCount: 468,
};

/**
 * Light kiosk liveness — one soft eye blink only.
 * Gate is intentional light; quality comes from post-blink best-frame pick for SFace.
 */
export const KIOSK_LIGHT_BLINK: BlinkDetectorConfig = {
  requiredBlinks: 1,
  minClosedFrames: 1,
  minOpenFrames: 1,
  // Soft: partial blinks count (higher close / lower reopen bar).
  earCloseThreshold: 0.23,
  earOpenThreshold: 0.26,
  timeoutMs: 10_000,
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function distance(a: FaceLandmark, b: FaceLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Eye Aspect Ratio (Soukupová & Čech).
 * Points: [p1 outer, p2, p3, p4 inner, p5, p6] around the eye.
 */
export function computeEyeAspectRatio(
  eye: readonly FaceLandmark[],
): number {
  if (eye.length < 6) {
    return Number.NaN;
  }
  const [p1, p2, p3, p4, p5, p6] = eye;
  const vertical = distance(p2, p6) + distance(p3, p5);
  const horizontal = distance(p1, p4);
  if (horizontal <= 1e-6) {
    return Number.NaN;
  }
  return vertical / (2 * horizontal);
}

export function extractEyeLandmarks(
  face: FaceLandmark[],
  indices: readonly number[],
): FaceLandmark[] {
  return indices.map((index) => {
    const point = face[index];
    if (!point) {
      throw new Error(`Missing face landmark at index ${index}`);
    }
    return point;
  });
}

export function computeFaceEyeMetrics(face: FaceLandmark[]): EyeMetrics | null {
  if (face.length < DEFAULT_CONFIG.minLandmarkCount) {
    return null;
  }

  try {
    const left = extractEyeLandmarks(face, MEDIAPIPE_LEFT_EYE_EAR_INDICES);
    const right = extractEyeLandmarks(face, MEDIAPIPE_RIGHT_EYE_EAR_INDICES);
    const leftEar = computeEyeAspectRatio(left);
    const rightEar = computeEyeAspectRatio(right);
    if (!Number.isFinite(leftEar) || !Number.isFinite(rightEar)) {
      return null;
    }
    return {
      leftEar,
      rightEar,
      ear: (leftEar + rightEar) / 2,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// BlinkDetector
// ---------------------------------------------------------------------------

/**
 * Provider-agnostic blink liveness state machine.
 *
 * Typical SDK usage:
 *   const detector = createBlinkDetector({ requiredBlinks: 1 });
 *   detector.start();
 *   // each animation frame after FaceLandmarker.detect():
 *   const sample = detector.processLandmarks(faces);
 *   if (sample.phase === "blink_confirmed") { ... capture best frame ... }
 */
export class BlinkDetector implements BlinkDetectorApi {
  private readonly config: Required<BlinkDetectorConfig>;
  private readonly listeners = new Set<BlinkEventListener>();

  private active = false;
  private phase: BlinkPhase = "idle";
  private error: BlinkError | null = null;
  private startedAt: number | null = null;
  private blinksDetected = 0;
  private openStreak = 0;
  private closedStreak = 0;
  private sawOpenBeforeClose = false;
  private lastMetrics: EyeMetrics | null = null;
  private faceDetected = false;

  constructor(config: BlinkDetectorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.earOpenThreshold <= this.config.earCloseThreshold) {
      throw new Error(
        "BlinkDetectorConfig.earOpenThreshold must be greater than earCloseThreshold.",
      );
    }
  }

  get sample(): BlinkSample {
    return this.buildSample(Date.now());
  }

  subscribe(listener: BlinkEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(options: { reset?: boolean } = {}): void {
    if (this.active && this.phase !== "blink_confirmed" && this.phase !== "timed_out") {
      this.fail({
        code: "ALREADY_ACTIVE",
        message: "Blink detection is already running.",
        retryable: false,
      });
      return;
    }

    if (options.reset !== false) {
      this.resetInternal(false);
    }

    this.active = true;
    this.startedAt = Date.now();
    this.error = null;
    this.setPhase("waiting_for_face", Date.now());
  }

  stop(): void {
    this.active = false;
    if (
      this.phase !== "blink_confirmed" &&
      this.phase !== "timed_out" &&
      this.phase !== "idle"
    ) {
      this.setPhase("idle", Date.now());
    }
  }

  reset(): void {
    this.resetInternal(true);
  }

  processLandmarks(
    faces: FaceLandmark[][],
    timestampMs: number = Date.now(),
  ): BlinkSample {
    if (!this.active) {
      this.fail({
        code: "NOT_STARTED",
        message: "Call start() before processLandmarks().",
        retryable: true,
      });
      return this.buildSample(timestampMs);
    }

    if (
      this.config.timeoutMs > 0 &&
      this.startedAt !== null &&
      timestampMs - this.startedAt >= this.config.timeoutMs &&
      this.phase !== "blink_confirmed"
    ) {
      this.setPhase("timed_out", timestampMs);
      this.active = false;
      const sample = this.buildSample(timestampMs);
      this.emit({ type: "timeout", sample });
      return sample;
    }

    if (faces.length > 1) {
      this.faceDetected = true;
      this.lastMetrics = null;
      this.fail({
        code: "MULTIPLE_FACES",
        message: "Multiple faces detected. Ask the employee to be alone in frame.",
        retryable: true,
      });
      return this.buildSample(timestampMs);
    }

    if (faces.length === 0) {
      this.faceDetected = false;
      this.lastMetrics = null;
      this.openStreak = 0;
      this.closedStreak = 0;
      this.sawOpenBeforeClose = false;
      if (this.phase !== "blink_confirmed" && this.phase !== "timed_out") {
        this.setPhase("waiting_for_face", timestampMs);
      }
      return this.emitSample(timestampMs);
    }

    const face = faces[0];
    if (face.length < this.config.minLandmarkCount) {
      this.faceDetected = true;
      this.lastMetrics = null;
      this.fail({
        code: "LANDMARKS_UNSTABLE",
        message: "Face landmarks are incomplete for blink detection.",
        retryable: true,
      });
      return this.buildSample(timestampMs);
    }

    const metrics = computeFaceEyeMetrics(face);
    this.faceDetected = true;
    this.lastMetrics = metrics;

    if (!metrics) {
      this.fail({
        code: "LANDMARKS_UNSTABLE",
        message: "Unable to compute eye aspect ratio from landmarks.",
        retryable: true,
      });
      return this.buildSample(timestampMs);
    }

    // Clear transient tracking errors once metrics are healthy again.
    if (
      this.error &&
      (this.error.code === "NO_FACE" ||
        this.error.code === "LANDMARKS_UNSTABLE" ||
        this.error.code === "MULTIPLE_FACES")
    ) {
      this.error = null;
    }

    this.updateBlinkStateMachine(metrics, timestampMs);
    return this.emitSample(timestampMs);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private updateBlinkStateMachine(
    metrics: EyeMetrics,
    timestampMs: number,
  ): void {
    if (this.phase === "blink_confirmed" || this.phase === "timed_out") {
      return;
    }

    // Light blink: either eye closed enough counts; either eye open enough reopens.
    const isClosed =
      Math.min(metrics.leftEar, metrics.rightEar) <=
      this.config.earCloseThreshold;
    const isOpen =
      Math.max(metrics.leftEar, metrics.rightEar) >=
      this.config.earOpenThreshold;

    if (isClosed) {
      this.closedStreak += 1;
      this.openStreak = 0;
      if (this.closedStreak === 1 && this.phase === "eyes_open") {
        this.setPhase("eyes_closing", timestampMs);
      }
      if (this.closedStreak >= this.config.minClosedFrames) {
        this.setPhase("eyes_closed", timestampMs);
      }
      return;
    }

    if (isOpen) {
      this.openStreak += 1;
      if (this.openStreak >= this.config.minOpenFrames) {
        this.sawOpenBeforeClose = true;
      }

      const closedEnough = this.closedStreak >= this.config.minClosedFrames;
      this.closedStreak = 0;

      if (closedEnough && this.sawOpenBeforeClose) {
        this.setPhase("eyes_opening", timestampMs);
        this.registerBlink(timestampMs);
        return;
      }

      this.setPhase("eyes_open", timestampMs);
      return;
    }

    // Hysteresis band between close/open thresholds — hold streak softly.
    if (this.phase === "waiting_for_face") {
      this.setPhase("eyes_open", timestampMs);
    }
  }

  private registerBlink(timestampMs: number): void {
    this.blinksDetected += 1;
    this.sawOpenBeforeClose = true;
    this.openStreak = 0;
    this.closedStreak = 0;

    const sample = this.buildSample(timestampMs);
    this.emit({
      type: "blink_progress",
      blinksDetected: this.blinksDetected,
      requiredBlinks: this.config.requiredBlinks,
      sample,
    });

    if (this.blinksDetected >= this.config.requiredBlinks) {
      this.setPhase("blink_confirmed", timestampMs);
      this.active = false;
      this.emit({
        type: "blink_confirmed",
        sample: this.buildSample(timestampMs),
      });
    } else {
      this.setPhase("eyes_open", timestampMs);
    }
  }

  private resetInternal(emitEvent: boolean): void {
    this.active = false;
    this.phase = "idle";
    this.error = null;
    this.startedAt = null;
    this.blinksDetected = 0;
    this.openStreak = 0;
    this.closedStreak = 0;
    this.sawOpenBeforeClose = false;
    this.lastMetrics = null;
    this.faceDetected = false;
    if (emitEvent) {
      this.emit({ type: "reset", sample: this.buildSample(Date.now()) });
    }
  }

  private setPhase(next: BlinkPhase, timestampMs: number): void {
    const previous = this.phase;
    if (previous === next) {
      return;
    }
    this.phase = next;
    this.emit({
      type: "phase_changed",
      previous,
      current: next,
      sample: this.buildSample(timestampMs),
    });
  }

  private fail(error: BlinkError): void {
    this.error = error;
    if (error.code !== "ALREADY_ACTIVE" && error.code !== "NOT_STARTED") {
      this.setPhase("error", Date.now());
    }
    this.emit({
      type: "error",
      error,
      sample: this.buildSample(Date.now()),
    });
  }

  private emitSample(timestampMs: number): BlinkSample {
    const sample = this.buildSample(timestampMs);
    this.emit({ type: "sample", sample });
    return sample;
  }

  private buildSample(timestampMs: number): BlinkSample {
    const required = this.config.requiredBlinks;
    return {
      timestamp: timestampMs,
      metrics: this.lastMetrics,
      faceDetected: this.faceDetected,
      phase: this.phase,
      blinksDetected: this.blinksDetected,
      requiredBlinks: required,
      progress: required <= 0 ? 1 : Math.min(1, this.blinksDetected / required),
      error: this.error,
    };
  }

  private emit(event: BlinkEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // Host listener failures must not break liveness tracking.
      }
    }
  }
}

export function createBlinkDetector(
  config: BlinkDetectorConfig = {},
): BlinkDetector {
  return new BlinkDetector(config);
}

// ---------------------------------------------------------------------------
// Optional MediaPipe Tasks Vision adapter (loaded lazily)
// ---------------------------------------------------------------------------

export interface MediaPipeFaceLandmarkerSourceOptions {
  /**
   * WASM assets base URL for @mediapipe/tasks-vision.
   * Default uses the official Google CDN matching the installed package major.
   */
  wasmBaseUrl?: string;
  /**
   * Face landmarker model URL.
   * Default: official MediaPipe face_landmarker.task
   */
  modelAssetPath?: string;
  /** Prefer GPU when available for lower latency on kiosk Chrome. */
  delegate?: "CPU" | "GPU";
  numFaces?: number;
  /** Lower = detect faces sooner (default 0.4 for fast kiosk capture). */
  minFaceDetectionConfidence?: number;
  minFacePresenceConfidence?: number;
  minTrackingConfidence?: number;
}

/**
 * Creates a FaceLandmarkSource backed by MediaPipe Face Landmarker.
 * Requires dependency: `@mediapipe/tasks-vision`.
 *
 * This keeps BlinkDetector free of hard MediaPipe coupling while still
 * supporting production browser landmarking.
 */
export async function createMediaPipeFaceLandmarkerSource(
  options: MediaPipeFaceLandmarkerSourceOptions = {},
): Promise<FaceLandmarkSource> {
  let vision: typeof import("@mediapipe/tasks-vision");
  try {
    vision = await import("@mediapipe/tasks-vision");
  } catch {
    throw new Error(
      "Missing dependency @mediapipe/tasks-vision. Install it in sdk/ to enable MediaPipe face landmarks.",
    );
  }

  const wasmBaseUrl =
    options.wasmBaseUrl ??
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
  const modelAssetPath =
    options.modelAssetPath ??
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

  const fileset = await vision.FilesetResolver.forVisionTasks(wasmBaseUrl);
  const preferredDelegate = options.delegate ?? "GPU";
  const landmarker = await createLandmarkerWithFallback(
    vision,
    fileset,
    modelAssetPath,
    preferredDelegate,
    options,
  );

  return {
    name: "mediapipe-face-landmarker",
    async detect(input) {
      const now = performance.now();
      const result = landmarker.detectForVideo(input, now);
      return (result.faceLandmarks ?? []).map((face) =>
        face.map((point) => ({
          x: point.x,
          y: point.y,
          z: point.z,
        })),
      );
    },
    close() {
      landmarker.close();
    },
  };
}

async function createLandmarkerWithFallback(
  vision: typeof import("@mediapipe/tasks-vision"),
  fileset: Awaited<
    ReturnType<typeof import("@mediapipe/tasks-vision").FilesetResolver.forVisionTasks>
  >,
  modelAssetPath: string,
  preferredDelegate: "CPU" | "GPU",
  options: MediaPipeFaceLandmarkerSourceOptions,
) {
  const delegates: Array<"CPU" | "GPU"> =
    preferredDelegate === "GPU" ? ["GPU", "CPU"] : ["CPU"];

  let lastError: unknown;
  for (const delegate of delegates) {
    try {
      return await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath,
          delegate,
        },
        runningMode: "VIDEO",
        numFaces: options.numFaces ?? 1,
        minFaceDetectionConfidence: options.minFaceDetectionConfidence ?? 0.4,
        minFacePresenceConfidence: options.minFacePresenceConfidence ?? 0.4,
        minTrackingConfidence: options.minTrackingConfidence ?? 0.4,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to create MediaPipe Face Landmarker.");
}

export interface MediaPipeFaceDetectorSourceOptions {
  wasmBaseUrl?: string;
  modelAssetPath?: string;
  delegate?: "CPU" | "GPU";
  minDetectionConfidence?: number;
}

export interface FacePresenceSource {
  readonly name: string;
  /** Returns number of faces detected (fast path — no mesh). */
  countFaces(
    input: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
  ): Promise<number>;
  close(): Promise<void> | void;
}

/**
 * Lightweight BlazeFace detector for fast "face present?" checks.
 * Use before Face Landmarker so the UI can react immediately.
 */
export async function createMediaPipeFaceDetectorSource(
  options: MediaPipeFaceDetectorSourceOptions = {},
): Promise<FacePresenceSource> {
  let vision: typeof import("@mediapipe/tasks-vision");
  try {
    vision = await import("@mediapipe/tasks-vision");
  } catch {
    throw new Error(
      "Missing dependency @mediapipe/tasks-vision. Install it in sdk/ to enable MediaPipe face detection.",
    );
  }

  const wasmBaseUrl =
    options.wasmBaseUrl ??
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
  const modelAssetPath =
    options.modelAssetPath ??
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

  const fileset = await vision.FilesetResolver.forVisionTasks(wasmBaseUrl);
  const preferredDelegate = options.delegate ?? "GPU";
  const delegates: Array<"CPU" | "GPU"> =
    preferredDelegate === "GPU" ? ["GPU", "CPU"] : ["CPU"];

  let detector: {
    detectForVideo: (
      input: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
      timestamp: number,
    ) => { detections?: unknown[] };
    close: () => void;
  } | null = null;
  let lastError: unknown;
  for (const delegate of delegates) {
    try {
      detector = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath,
          delegate,
        },
        runningMode: "VIDEO",
        minDetectionConfidence: options.minDetectionConfidence ?? 0.45,
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!detector) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to create MediaPipe Face Detector.");
  }

  const faceDetector = detector;
  return {
    name: "mediapipe-face-detector",
    async countFaces(input) {
      const result = faceDetector.detectForVideo(input, performance.now());
      return result.detections?.length ?? 0;
    },
    close() {
      faceDetector.close();
    },
  };
}
