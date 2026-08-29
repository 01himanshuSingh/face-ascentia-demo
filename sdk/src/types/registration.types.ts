/**
 * Plant list + registration-first self-enroll contracts.
 */

import type { FaceCaptureResult } from "./auth.types";

export const PLANTS_PATH = "/plants" as const;

export const REGISTER_PATH = "/register" as const;
export const REGISTER_EMPLOYEE_ID_FIELD = "employee_id" as const;
export const REGISTER_PLANT_ID_FIELD = "plant_id" as const;
export const REGISTER_FULL_NAME_FIELD = "full_name" as const;
export const REGISTER_IMAGE_FIELD = "image" as const;
export const REGISTER_KIOSK_ID_FIELD = "kiosk_id" as const;
export const REGISTER_SESSION_ID_FIELD = "session_id" as const;

export const RegistrationErrorCode = {
  MISSING_EMPLOYEE_ID: "MISSING_EMPLOYEE_ID",
  MISSING_PLANT_ID: "MISSING_PLANT_ID",
  MISSING_FULL_NAME: "MISSING_FULL_NAME",
  PLANT_NOT_FOUND: "PLANT_NOT_FOUND",
  PLANT_MISMATCH: "PLANT_MISMATCH",
  EMPLOYEE_NOT_FOUND: "EMPLOYEE_NOT_FOUND",
  EMPLOYEE_INACTIVE: "EMPLOYEE_INACTIVE",
  ALREADY_ENROLLED: "ALREADY_ENROLLED",
  PENDING_REGISTRATION_EXISTS: "PENDING_REGISTRATION_EXISTS",
  DUPLICATE_FACE: "DUPLICATE_FACE",
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

export type RegistrationErrorCode =
  (typeof RegistrationErrorCode)[keyof typeof RegistrationErrorCode];

export const RegistrationStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type RegistrationStatus =
  (typeof RegistrationStatus)[keyof typeof RegistrationStatus];

export const RegistrationSource = {
  KIOSK: "KIOSK",
  ADMIN_PORTAL: "ADMIN_PORTAL",
  ADMIN_KIOSK: "ADMIN_KIOSK",
} as const;

export type RegistrationSource =
  (typeof RegistrationSource)[keyof typeof RegistrationSource];

export interface PlantListItem {
  plantId: string;
  plantCode: string;
  plantName: string;
}

export interface PlantListResponse {
  plants: PlantListItem[];
}

export interface RegistrationErrorBody {
  detail: string;
  code: RegistrationErrorCode;
}

export interface RegisterResult {
  requestId: string;
  employeeId: string;
  plantId: string;
  submittedFullName: string;
  status: RegistrationStatus;
  source: RegistrationSource;
  message: string;
  submittedAt?: string | null;
}

export interface RegisterSubmitPayload {
  employeeId: string;
  plantId: string;
  fullName: string;
}

export interface RegisterRequest extends RegisterSubmitPayload {
  image: FaceCaptureResult | Blob;
  filename?: string;
  kioskId?: string;
  sessionId?: string;
}

export function isPlantListResponse(value: unknown): value is PlantListResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.plants);
}

export function isRegisterResult(value: unknown): value is RegisterResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.requestId === "string" &&
    typeof record.employeeId === "string" &&
    typeof record.plantId === "string" &&
    typeof record.submittedFullName === "string" &&
    typeof record.status === "string" &&
    typeof record.source === "string" &&
    typeof record.message === "string"
  );
}

export function isRegistrationErrorBody(
  value: unknown,
): value is RegistrationErrorBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.detail === "string" &&
    typeof record.code === "string" &&
    Object.values(RegistrationErrorCode).includes(
      record.code as RegistrationErrorCode,
    )
  );
}
