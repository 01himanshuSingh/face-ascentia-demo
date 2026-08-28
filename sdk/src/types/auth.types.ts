/**
 * Public auth/capture types for the npm SDK (Mendix host).
 *
 * Contract alignment
 * ------------------
 * These shapes mirror backend/app/schemas/auth.py:
 *   - AuthenticateResult  ↔ AuthenticateResponse (HTTP 200, camelCase JSON)
 *   - AuthErrorBody       ↔ AuthErrorResponse   (HTTP 4xx)
 *   - AuthErrorCode       ↔ AuthErrorCode enum
 *
 * Transport (Week 1)
 * ------------------
 * POST {apiBaseUrl}/authenticate
 *   multipart/form-data: employee_id + image (JPEG from FaceCaptureResult.blob)
 *
 * Mendix branching
 * ----------------
 * - HTTP 200 + authenticated=true  → allow login
 * - HTTP 200 + authenticated=false → deny (wrong face; not an HTTP error)
 * - HTTP 4xx + AuthErrorBody.code  → show detail / retry per code
 *
 * SDK-owned: camera, blink, burst capture.
 * Backend-owned: detect, SFace embed, DB lookup, cosine decision.
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
 * One best frame after burst — ready to POST to the Debian face-auth API.
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

// ---------------------------------------------------------------------------
// POST /authenticate — HTTP contract (keep in sync with backend schemas/auth.py)
// ---------------------------------------------------------------------------

/** Multipart form field for business Employee ID. */
export const AUTHENTICATE_EMPLOYEE_ID_FIELD = "employee_id" as const;

/** Multipart file field for the SDK JPEG still. */
export const AUTHENTICATE_IMAGE_FIELD = "image" as const;

/** Authenticate path appended to apiBaseUrl (no trailing slash on base). */
export const AUTHENTICATE_PATH = "/authenticate" as const;

/**
 * Stable machine codes returned on authenticate failures (HTTP 4xx).
 * Immutable once shipped — Mendix may branch on these values.
 */
export const AuthErrorCode = {
  MISSING_EMPLOYEE_ID: "MISSING_EMPLOYEE_ID",
  EMPLOYEE_NOT_FOUND: "EMPLOYEE_NOT_FOUND",
  EMPLOYEE_INACTIVE: "EMPLOYEE_INACTIVE",
  ENROLLMENT_NOT_FOUND: "ENROLLMENT_NOT_FOUND",
  EMPTY_IMAGE: "EMPTY_IMAGE",
  INVALID_IMAGE: "INVALID_IMAGE",
  UNSUPPORTED_IMAGE_TYPE: "UNSUPPORTED_IMAGE_TYPE",
  IMAGE_TOO_LARGE: "IMAGE_TOO_LARGE",
  NO_FACE: "NO_FACE",
  MULTIPLE_FACES: "MULTIPLE_FACES",
  DETECT_FAILED: "DETECT_FAILED",
  EMBED_FAILED: "EMBED_FAILED",
  EMBEDDING_DIMENSION_MISMATCH: "EMBEDDING_DIMENSION_MISMATCH",
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

/**
 * Error JSON body from POST /authenticate when the pipeline cannot complete.
 * Wrong face is NOT this shape — see AuthenticateResult with authenticated=false.
 */
export interface AuthErrorBody {
  detail: string;
  code: AuthErrorCode;
}

/**
 * Success-path response from POST /authenticate (HTTP 200).
 *
 * Includes authenticated=false when the face does not match the enrollment
 * for the given Employee ID (cosine score below server threshold).
 *
 * Internal to SDK HTTP layer — Mendix receives MendixAuthenticateResult instead.
 */
export interface AuthenticateResult {
  employeeId: string;
  authenticated: boolean;
  /** Cosine similarity vs ACTIVE enrollment; null only if server could not compute. */
  score: number | null;
  /** Server cosine gate used for this decision (settings.face_match_cosine_threshold). */
  threshold: number;
  /** Human-readable message for kiosk / Mendix UI. */
  message: string;
  /** Present when authenticated=true. */
  fullName?: string | null;
  /** SFace model version used for the live embedding. */
  modelVersion?: string | null;
  /** Model version stored on the ACTIVE enrollment row. */
  enrollmentModelVersion?: string | null;
}

/**
 * Public result returned from FaceAuthSDK.authenticate() to Mendix.
 *
 * Mendix branches only on authenticated; backend score/threshold stay internal.
 */
export interface MendixAuthenticateResult {
  employeeId: string;
  authenticated: boolean;
}

/** Runtime guard for parsing JSON from POST /authenticate (200). */
export function isAuthenticateResult(value: unknown): value is AuthenticateResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.employeeId === "string" &&
    typeof record.authenticated === "boolean" &&
    (record.score === null || typeof record.score === "number") &&
    typeof record.threshold === "number" &&
    typeof record.message === "string"
  );
}

/** Runtime guard for parsing JSON from POST /authenticate (4xx). */
export function isAuthErrorBody(value: unknown): value is AuthErrorBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.detail === "string" &&
    typeof record.code === "string" &&
    Object.values(AuthErrorCode).includes(record.code as AuthErrorCode)
  );
}
