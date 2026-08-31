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
  type AuthenticateOrRegisterOutcome,
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

export type {
  RegisterRequest,
  RegisterResult,
  RegistrationErrorBody,
  PlantListItem,
} from "./types/registration.types";

export {
  PLANTS_PATH,
  REGISTER_PATH,
  REGISTER_EMPLOYEE_ID_FIELD,
  REGISTER_PLANT_ID_FIELD,
  REGISTER_FULL_NAME_FIELD,
  REGISTER_IMAGE_FIELD,
  RegistrationErrorCode,
  RegistrationStatus,
  RegistrationSource,
  isRegisterResult,
  isRegistrationErrorBody,
  isPlantListResponse,
} from "./types/registration.types";

export {
  createFaceAuthClient,
  FaceAuthClient,
  FaceAuthApiError,
  isFaceAuthApiError,
  type FaceAuthClientConfig,
  type AuthenticateRequest,
  type FaceAuthClientErrorCode,
} from "./api/FaceAuthClient";

/** Advanced / test-only exports — Mendix should prefer createFaceAuthSDK(). */
export { CameraOverlay, type CameraOverlayProps } from "./components/CameraOverlay";
export { RegisterOverlay, type RegisterOverlayProps, type RegisterSubmitPayload } from "./components/RegisterOverlay";
export { AuthScoreToast, type AuthScoreToastProps } from "./components/AuthScoreToast";
export {
  showSdkFeedbackToast,
  dismissSdkFeedbackToast,
} from "./ui/showSdkFeedbackToast";
export type {
  SdkFeedbackPayload,
  SdkFeedbackVariant,
  SdkFeedbackDetailRow,
} from "./ui/feedbackToast.types";
export { createCameraManager, CameraManager } from "./camera/CameraManager";
export type { CameraManagerApi } from "./camera/camera.types";
export {
  createBurstCapture,
  BurstCapture,
  POST_BLINK_CAPTURE,
} from "./camera/BurstCapture";
