/**
 * Kiosk admin contracts (Path B — plant admin enrolls workers at kiosk).
 *
 * Contract alignment
 * ------------------
 * Mirrors backend/app/schemas/kiosk_admin.py:
 *   - KioskAdminLoginResponse   ↔ POST /kiosk/admin-login (HTTP 200)
 *   - KioskAdminEnrollResponse    ↔ POST /kiosk/admin-enroll (HTTP 201)
 *   - KioskAdminLogoutResponse    ↔ POST /kiosk/admin-logout (HTTP 200)
 *   - KioskAdminErrorBody         ↔ KioskAdminErrorResponse (HTTP 4xx)
 *
 * System boundary
 * ---------------
 * Mendix never imports this module — FaceAuthSDK + FaceAuthClient only.
 *
 *   SDK overlay (admin login → enroll loop)
 *         ↓
 *   FaceAuthClient.kioskAdminLogin | enroll | logout
 *         ↓
 *   POST {apiBaseUrl}/kiosk/admin-*
 *
 * Rules (v1)
 * ----------
 * - Admin login: operator employeeId + password (admin_roles — not face).
 * - Enroll: target worker employeeId + fresh JPEG only — no plantId in body.
 * - plantId on enroll response comes from admin session (server authoritative).
 * - Does NOT grant admin roles — workers only.
 * - kioskId / sessionId on enroll are optional and omitted in current rollout.
 *
 * Contrast (do not merge types)
 * -----------------------------
 *   registration.types.ts  → Path A PENDING self-register
 *   kioskAdmin.types.ts      → Path B ACTIVE admin-enroll at kiosk
 */

import type { FaceCaptureResult } from "./auth.types";
import {
  type RegistrationSource as RegistrationSourceType,
  type RegistrationStatus as RegistrationStatusType,
} from "./registration.types";

// ---------------------------------------------------------------------------
// HTTP paths + transport constants (keep in sync with backend kiosk_admin.py)
// ---------------------------------------------------------------------------

export const KIOSK_ADMIN_PREFIX = "/kiosk" as const;

export const KIOSK_ADMIN_LOGIN_PATH = `${KIOSK_ADMIN_PREFIX}/admin-login` as const;
export const KIOSK_ADMIN_ENROLL_PATH = `${KIOSK_ADMIN_PREFIX}/admin-enroll` as const;
export const KIOSK_ADMIN_LOGOUT_PATH = `${KIOSK_ADMIN_PREFIX}/admin-logout` as const;

/** Same header as Admin Portal — one session store on backend. */
export const KIOSK_ADMIN_SESSION_HEADER = "X-Admin-Session-Token" as const;

/** JSON body keys for POST /kiosk/admin-login. */
export const KIOSK_ADMIN_LOGIN_EMPLOYEE_ID_JSON = "employeeId" as const;
export const KIOSK_ADMIN_LOGIN_PASSWORD_JSON = "password" as const;

/** Multipart form keys for POST /kiosk/admin-enroll (v1). */
export const KIOSK_ADMIN_ENROLL_EMPLOYEE_ID_FIELD = "employee_id" as const;
export const KIOSK_ADMIN_ENROLL_IMAGE_FIELD = "image" as const;

/** Deferred — fleet registry not wired; omit in v1 SDK calls. */
export const KIOSK_ADMIN_ENROLL_KIOSK_ID_FIELD = "kiosk_id" as const;

/** Future — per-capture session id for audit. */
export const KIOSK_ADMIN_ENROLL_SESSION_ID_FIELD = "session_id" as const;

// ---------------------------------------------------------------------------
// Stable enums (immutable once shipped — SDK UI may branch on these)
// ---------------------------------------------------------------------------

export const KioskAdminErrorCode = {
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ADMIN_INACTIVE: "ADMIN_INACTIVE",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  UNAUTHORIZED: "UNAUTHORIZED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  KIOSK_PLANT_REQUIRED: "KIOSK_PLANT_REQUIRED",
  PLANT_ACCESS_DENIED: "PLANT_ACCESS_DENIED",
  MISSING_EMPLOYEE_ID: "MISSING_EMPLOYEE_ID",
  EMPLOYEE_INACTIVE: "EMPLOYEE_INACTIVE",
  ALREADY_ENROLLED: "ALREADY_ENROLLED",
  PENDING_REGISTRATION_EXISTS: "PENDING_REGISTRATION_EXISTS",
  PLANT_MISMATCH: "PLANT_MISMATCH",
  DUPLICATE_FACE: "DUPLICATE_FACE",
  EMPTY_IMAGE: "EMPTY_IMAGE",
  INVALID_IMAGE: "INVALID_IMAGE",
  UNSUPPORTED_IMAGE_TYPE: "UNSUPPORTED_IMAGE_TYPE",
  IMAGE_TOO_LARGE: "IMAGE_TOO_LARGE",
  NO_FACE: "NO_FACE",
  MULTIPLE_FACES: "MULTIPLE_FACES",
  DETECT_FAILED: "DETECT_FAILED",
  EMBED_FAILED: "EMBED_FAILED",
} as const;

export type KioskAdminErrorCode =
  (typeof KioskAdminErrorCode)[keyof typeof KioskAdminErrorCode];

/** v1 kiosk enroll operator roles (informational — backend enforces). */
export const KioskAdminRole = {
  PLANT_ADMIN: "PLANT_ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

export type KioskAdminRole =
  (typeof KioskAdminRole)[keyof typeof KioskAdminRole];

export const EnrollmentStatus = {
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
} as const;

export type EnrollmentStatus =
  (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

// ---------------------------------------------------------------------------
// POST /kiosk/admin-login
// ---------------------------------------------------------------------------

/** Admin operator credentials — not the worker being enrolled. */
export interface KioskAdminLoginRequest {
  /** Admin's business Employee ID (admin_roles). */
  employeeId: string;
  password: string;
}

/**
 * Success body for POST /kiosk/admin-login.
 * SDK holds adminSessionToken in memory for enroll/logout calls.
 */
export interface KioskAdminLoginResponse {
  adminSessionToken: string;
  /** Authenticated admin operator Employee ID. */
  employeeId: string;
  role: string;
  /** Plant workspace for all enrollments in this session (null for SUPER_ADMIN). */
  plantId: string | null;
  plantCode?: string | null;
  plantName?: string | null;
  expiresAt: string;
}

/**
 * SDK in-memory session snapshot after kiosk admin login.
 * Never persist to localStorage in v1 — kiosk shared device risk.
 */
export interface KioskAdminSession {
  adminSessionToken: string;
  employeeId: string;
  role: string;
  plantId: string | null;
  plantCode?: string | null;
  plantName?: string | null;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// POST /kiosk/admin-enroll
// ---------------------------------------------------------------------------

/** Target worker to enroll — fresh capture required (never reuse auth JPEG). */
export interface KioskAdminEnrollRequest {
  /** Target worker Employee ID (not the admin operator). */
  employeeId: string;
  image: FaceCaptureResult | Blob;
  filename?: string;
  /** Optional — omitted in current rollout. */
  kioskId?: string;
  /** Optional — future capture session audit. */
  sessionId?: string;
}

/**
 * Success body for POST /kiosk/admin-enroll (HTTP 201).
 * Worker may authenticate immediately — no Admin Portal approve step.
 */
export interface KioskAdminEnrollResult {
  success: boolean;
  requestId: string;
  /** Target worker Employee ID enrolled. */
  employeeId: string;
  /** Server-assigned from admin session — not sent in request. */
  plantId: string;
  enrollmentStatus: EnrollmentStatus;
  registrationStatus: RegistrationStatusType;
  source: RegistrationSourceType;
  message: string;
}

// ---------------------------------------------------------------------------
// POST /kiosk/admin-logout
// ---------------------------------------------------------------------------

export interface KioskAdminLogoutResult {
  success: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface KioskAdminErrorBody {
  detail: string;
  code: KioskAdminErrorCode;
}

// ---------------------------------------------------------------------------
// Runtime type guards (FaceAuthClient response parsing)
// ---------------------------------------------------------------------------

export function isKioskAdminLoginResponse(
  value: unknown,
): value is KioskAdminLoginResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.adminSessionToken === "string" &&
    typeof record.employeeId === "string" &&
    typeof record.role === "string" &&
    (record.plantId === null || typeof record.plantId === "string") &&
    typeof record.expiresAt === "string"
  );
}

export function isKioskAdminEnrollResult(
  value: unknown,
): value is KioskAdminEnrollResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.success === "boolean" &&
    typeof record.requestId === "string" &&
    typeof record.employeeId === "string" &&
    typeof record.plantId === "string" &&
    typeof record.enrollmentStatus === "string" &&
    typeof record.registrationStatus === "string" &&
    typeof record.source === "string" &&
    typeof record.message === "string"
  );
}

export function isKioskAdminLogoutResult(
  value: unknown,
): value is KioskAdminLogoutResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.success === "boolean" && typeof record.message === "string";
}

export function isKioskAdminErrorBody(
  value: unknown,
): value is KioskAdminErrorBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.detail === "string" &&
    typeof record.code === "string" &&
    Object.values(KioskAdminErrorCode).includes(record.code as KioskAdminErrorCode)
  );
}

/** Map login response to SDK session snapshot. */
export function toKioskAdminSession(
  response: KioskAdminLoginResponse,
): KioskAdminSession {
  return {
    adminSessionToken: response.adminSessionToken,
    employeeId: response.employeeId,
    role: response.role,
    plantId: response.plantId,
    plantCode: response.plantCode,
    plantName: response.plantName,
    expiresAt: response.expiresAt,
  };
}
