/**
 * Camera type contract for the Face Authentication SDK.
 *
 * Design goals (Mendix / kiosk host integration):
 * - Stable, serializable status and error codes for host UI branching
 * - Explicit lifecycle states so CameraOverlay and CameraManager stay aligned
 * - Extensible options (deviceId, resolution) without breaking existing callers
 * - Audio is never part of face authentication
 *
 * CameraManager will implement this contract; hosts should depend on these
 * types rather than MediaStream internals.
 */

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Discrete camera lifecycle states.
 * Hosts (Mendix / test-harness) should react to these, not ad-hoc flags.
 */
export type CameraStatus =
  | "idle"
  | "requesting_permission"
  | "starting"
  | "active"
  | "stopping"
  | "stopped"
  | "error";

/**
 * Terminal / recoverable camera failure categories.
 * Prefer these codes over parsing Error.message in the host application.
 */
export type CameraErrorCode =
  | "PERMISSION_DENIED"
  | "PERMISSION_DISMISSED"
  | "DEVICE_NOT_FOUND"
  | "DEVICE_IN_USE"
  | "DEVICE_DISCONNECTED"
  | "CONSTRAINT_NOT_SATISFIED"
  | "SECURE_CONTEXT_REQUIRED"
  | "UNSUPPORTED_BROWSER"
  | "STREAM_ENDED"
  | "ALREADY_ACTIVE"
  | "NOT_ACTIVE"
  | "UNKNOWN";

export interface CameraError {
  code: CameraErrorCode;
  message: string;
  /** Original browser/DOM error name when available (e.g. NotAllowedError). */
  causeName?: string;
  /** True when retrying start() may succeed without user settings changes. */
  retryable: boolean;
}

// ---------------------------------------------------------------------------
// Constraints & start options
// ---------------------------------------------------------------------------

/**
 * Default face-auth capture policy.
 * Microphone is intentionally excluded from authentication.
 */
export interface CameraMediaPolicy {
  readonly video: true;
  readonly audio: false;
}

/**
 * Optional video preferences.
 *
 * Default face-auth behavior uses the browser's default video camera —
 * portable across kiosks and hardware. Every field here is optional.
 * `deviceId` is an advanced override only (multi-camera machines), never required.
 */
export interface CameraVideoPreferences {
  /**
   * Advanced: pin a specific camera from enumerateDevices().
   * Leave unset so any kiosk camera works (recommended default).
   */
  deviceId?: string;
  /** Ideal width in pixels (browser may choose nearest supported). */
  width?: number;
  /** Ideal height in pixels. */
  height?: number;
  /** Ideal frames per second. */
  frameRate?: number;
  facingMode?: "user" | "environment";
}

/**
 * Arguments accepted by CameraManager.start().
 * Pass `{}` or omit — SDK requests any video device, never audio.
 * Safe to expand later without breaking Mendix integrations.
 */
export interface CameraStartOptions {
  video?: CameraVideoPreferences;
  /**
   * Only relevant when video.deviceId is set.
   * When true, fail if that exact device is unavailable.
   * Default / recommended: leave unset and allow any camera.
   */
  strictDeviceMatch?: boolean;
}

// ---------------------------------------------------------------------------
// Runtime snapshot (read-only view for UI / host)
// ---------------------------------------------------------------------------

export interface CameraTrackInfo {
  trackId: string;
  label: string;
  readyState: MediaStreamTrackState;
  settings: MediaTrackSettings;
}

/**
 * Immutable snapshot of the current camera session.
 * Overlay / host should treat this as read-only.
 */
export interface CameraSessionSnapshot {
  status: CameraStatus;
  stream: MediaStream | null;
  videoTrack: CameraTrackInfo | null;
  error: CameraError | null;
  startedAt: number | null;
}

// ---------------------------------------------------------------------------
// Device enumeration (for future kiosk admin / diagnostics)
// ---------------------------------------------------------------------------

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  groupId: string;
}

// ---------------------------------------------------------------------------
// Events — scalable pub/sub for CameraManager → Overlay / SDK
// ---------------------------------------------------------------------------

export type CameraEventType =
  | "status_changed"
  | "started"
  | "stopped"
  | "error"
  | "track_ended";

export interface CameraStatusChangedEvent {
  type: "status_changed";
  previous: CameraStatus;
  current: CameraStatus;
  snapshot: CameraSessionSnapshot;
}

export interface CameraStartedEvent {
  type: "started";
  snapshot: CameraSessionSnapshot;
}

export interface CameraStoppedEvent {
  type: "stopped";
  snapshot: CameraSessionSnapshot;
  reason: "manual" | "error" | "track_ended";
}

export interface CameraErrorEvent {
  type: "error";
  error: CameraError;
  snapshot: CameraSessionSnapshot;
}

export interface CameraTrackEndedEvent {
  type: "track_ended";
  snapshot: CameraSessionSnapshot;
}

export type CameraEvent =
  | CameraStatusChangedEvent
  | CameraStartedEvent
  | CameraStoppedEvent
  | CameraErrorEvent
  | CameraTrackEndedEvent;

export type CameraEventListener = (event: CameraEvent) => void;

// ---------------------------------------------------------------------------
// Manager contract (implemented by CameraManager.ts)
// ---------------------------------------------------------------------------

/**
 * Public camera control surface used by FaceAuthSDK and CameraOverlay.
 * Mendix never talks to getUserMedia directly — only through this contract.
 */
export interface CameraManagerApi {
  readonly snapshot: CameraSessionSnapshot;

  start(options?: CameraStartOptions): Promise<CameraSessionSnapshot>;
  stop(): Promise<CameraSessionSnapshot>;

  /**
   * Always safe to call. Releases tracks even if start() failed mid-way.
   * Must not throw under normal browser conditions.
   */
  cleanup(): Promise<void>;

  listDevices(): Promise<CameraDeviceInfo[]>;

  subscribe(listener: CameraEventListener): () => void;
}

/**
 * Fixed media policy for face authentication.
 * CameraManager must request video only.
 */
export const FACE_AUTH_CAMERA_POLICY: CameraMediaPolicy = {
  video: true,
  audio: false,
};
