/**
 * Public auth/capture types for the npm SDK (Mendix host).
 *
 * Mendix talks only to these shapes + FaceAuthSDK.
 * Backend auth runs on a separate Debian server via apiBaseUrl later.
 */

/** Phases of the in-browser capture loop (SDK-owned). */
export type CapturePhase =
  | "idle"
  | "starting_camera"
  | "searching_face"
  | "face_detected"
  | "blink_prompt"
  | "capturing"
  | "completed"
  | "cancelled"
  | "error";

/**
 * One best frame after burst — ready to POST to the Debian face-auth API
 * (and later store as raw_images + derive SFace embedding server-side).
 */
export interface FaceCaptureResult {
  /** JPEG bytes for multipart upload to backend. */
  blob: Blob;
  /** Optional preview / debugging (avoid logging in production). */
  dataUrl: string;
  width: number;
  height: number;
  mimeType: "image/jpeg";
  capturedAt: number;
  /** How many burst frames were considered. */
  framesConsidered: number;
}

export interface FaceCaptureFailure {
  code:
    | "CAMERA_FAILED"
    | "FACE_TIMEOUT"
    | "BLINK_TIMEOUT"
    | "BLINK_FAILED"
    | "CAPTURE_FAILED"
    | "CANCELLED"
    | "UNKNOWN";
  message: string;
  phase: CapturePhase;
}

/** Future authenticate() response from Debian backend (contract reserved). */
export interface AuthenticateResult {
  employeeId: string;
  authenticated: boolean;
}
