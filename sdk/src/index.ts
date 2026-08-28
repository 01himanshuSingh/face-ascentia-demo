/**
 * @face-auth/sdk — npm package entry for the Mendix team.
 *
 * Deployment boundaries:
 * - Mendix kiosk Chrome loads this SDK (camera + blink + burst)
 * - Debian backend (apiBaseUrl) owns detect / SFace / pgvector / auth decision
 *
 * Mendix usage:
 *
 *   import { createFaceAuthSDK } from "@face-auth/sdk";
 *
 *   const sdk = createFaceAuthSDK({
 *     apiBaseUrl: "https://face-auth.customer.example",
 *   });
 *
 *   // Mendix Authenticate button (capture + backend verify):
 *   const { employeeId, authenticated } = await sdk.authenticate("EMP001");
 *
 *   await sdk.destroy();
 */

export {
  FaceAuthSDK,
  createFaceAuthSDK,
  type FaceAuthSDKConfig,
  type FaceAuthSDKCameraSession,
} from "./sdk/FaceAuthSDK";

export type {
  CapturePhase,
  FaceCaptureResult,
  FaceCaptureFailure,
  AuthenticateResult,
  MendixAuthenticateResult,
  AuthErrorBody,
} from "./types/auth.types";

export {
  AUTHENTICATE_EMPLOYEE_ID_FIELD,
  AUTHENTICATE_IMAGE_FIELD,
  AUTHENTICATE_PATH,
  AuthErrorCode,
  isAuthenticateResult,
  isAuthErrorBody,
} from "./types/auth.types";

export type {
  CameraStartOptions,
  CameraVideoPreferences,
  CameraError,
  CameraErrorCode,
  CameraStatus,
  CameraSessionSnapshot,
} from "./camera/camera.types";

export { FACE_AUTH_CAMERA_POLICY } from "./camera/camera.types";

export {
  createFaceAuthClient,
  FaceAuthClient,
  FaceAuthApiError,
  type FaceAuthClientConfig,
  type AuthenticateRequest,
  type FaceAuthClientErrorCode,
} from "./api/FaceAuthClient";

/** Advanced / test-only exports — Mendix should prefer createFaceAuthSDK(). */
export { CameraOverlay, type CameraOverlayProps } from "./components/CameraOverlay";
export { createCameraManager, CameraManager } from "./camera/CameraManager";
export type { CameraManagerApi } from "./camera/camera.types";
export {
  createBurstCapture,
  BurstCapture,
  POST_BLINK_CAPTURE,
} from "./camera/BurstCapture";
