/**
 * @ascentia/face-auth-sdk — public entry for Mendix.
 *
 * Mendix owns: Employee ID + Authenticate + a mount container.
 * This SDK owns: camera, liveness, capture, register / admin-kiosk overlays,
 * and HTTPS calls to the face-auth backend (`apiBaseUrl`).
 *
 * Only symbols exported here are a compatibility contract for Mendix.
 */

export {
  createFaceAuthSDK,
  FaceAuthSDK,
  type FaceAuthSDKConfig,
  type AuthenticateOrRegisterOutcome,
} from "./sdk/FaceAuthSDK";

export type {
  CapturePhase,
  MendixAuthenticateResult,
  AuthenticateResult,
} from "./types/auth.types";

export type { RegisterResult } from "./types/registration.types";

export {
  FaceAuthApiError,
  isFaceAuthApiError,
} from "./api/FaceAuthClient";
