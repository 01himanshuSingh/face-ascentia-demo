import { FaceAuthApiError, isFaceAuthApiError } from "../api/FaceAuthClient";
import { AuthErrorCode, type AuthenticateResult, type FaceCaptureFailure } from "../types/auth.types";
import { KioskAdminErrorCode } from "../types/kioskAdmin.types";
import type { KioskAdminEnrollResult } from "../types/kioskAdmin.types";
import { RegistrationErrorCode, type RegisterResult } from "../types/registration.types";
import type { SdkFeedbackPayload, SdkFeedbackVariant } from "./feedbackToast.types";

type ErrorCopy = {
  title: string;
  message: string;
  variant: SdkFeedbackVariant;
  hint?: string;
};

function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return value.toFixed(3);
}

function buildPayload(
  copy: ErrorCopy,
  code?: string,
  details: SdkFeedbackPayload["details"] = [],
): SdkFeedbackPayload {
  return {
    variant: copy.variant,
    title: copy.title,
    message: copy.message,
    code,
    hint: copy.hint,
    details,
  };
}

function lookupCopy(
  code: string,
  catalogs: Array<Partial<Record<string, ErrorCopy>>>,
  fallback: ErrorCopy,
): ErrorCopy {
  for (const catalog of catalogs) {
    const match = catalog[code];
    if (match) {
      return match;
    }
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Shared face / image pipeline (auth, register, kiosk enroll)
// ---------------------------------------------------------------------------

const FACE_IMAGE_ERROR_COPY: Partial<Record<string, ErrorCopy>> = {
  EMPTY_IMAGE: {
    title: "Photo missing",
    message: "No image was captured. Please try again.",
    variant: "error",
    hint: "Tap Capture & enroll and hold still until the photo is taken.",
  },
  INVALID_IMAGE: {
    title: "Photo could not be read",
    message: "The captured photo was invalid or corrupted.",
    variant: "error",
    hint: "Try again with even lighting and your face centered in the frame.",
  },
  UNSUPPORTED_IMAGE_TYPE: {
    title: "Unsupported photo format",
    message: "The server could not process this image type.",
    variant: "error",
    hint: "Retry the capture. Contact support if this keeps happening.",
  },
  IMAGE_TOO_LARGE: {
    title: "Photo too large",
    message: "The captured photo exceeded the size limit.",
    variant: "error",
    hint: "Move slightly back from the camera and try again.",
  },
  NO_FACE: {
    title: "No face detected",
    message: "We could not find a face in the photo.",
    variant: "warning",
    hint: "Remove masks or obstructions, face the camera, and try again.",
  },
  MULTIPLE_FACES: {
    title: "Multiple faces detected",
    message: "Only one person should be in the frame.",
    variant: "warning",
    hint: "Ask others to step away, then capture again.",
  },
  DETECT_FAILED: {
    title: "Face detection failed",
    message: "The camera photo could not be analyzed.",
    variant: "error",
    hint: "Check lighting and retry. Restart the browser if needed.",
  },
  EMBED_FAILED: {
    title: "Face template failed",
    message: "We detected a face but could not create a login template.",
    variant: "error",
    hint: "Try again with a clear, front-facing photo.",
  },
  EMBEDDING_DIMENSION_MISMATCH: {
    title: "System configuration error",
    message: "The face model on this kiosk does not match the server.",
    variant: "error",
    hint: "Contact IT — do not retry until the server is updated.",
  },
};

const NETWORK_ERROR_COPY: ErrorCopy = {
  title: "Connection problem",
  message: "Could not reach the face authentication server.",
  variant: "error",
  hint: "Check network or VPN, then try again.",
};

// ---------------------------------------------------------------------------
// Auth / authenticate
// ---------------------------------------------------------------------------

const AUTH_ERROR_COPY: Partial<Record<string, ErrorCopy>> = {
  ...FACE_IMAGE_ERROR_COPY,
  [AuthErrorCode.ENROLLMENT_NOT_FOUND]: {
    title: "Face login not set up",
    message: "This Employee ID has no active face enrollment yet.",
    variant: "info",
    hint: "Choose Employee Register or ask a plant admin to enroll you.",
  },
  [AuthErrorCode.EMPLOYEE_NOT_FOUND]: {
    title: "Employee ID not found",
    message: "This Employee ID is not in the system yet.",
    variant: "info",
    hint: "Choose Employee Register to submit your details for approval.",
  },
  [AuthErrorCode.EMPLOYEE_INACTIVE]: {
    title: "Account inactive",
    message: "This employee record is marked inactive.",
    variant: "warning",
    hint: "Contact HR or your plant admin to reactivate the account.",
  },
  [AuthErrorCode.MISSING_EMPLOYEE_ID]: {
    title: "Employee ID required",
    message: "Enter an Employee ID before authenticating.",
    variant: "warning",
  },
};

// ---------------------------------------------------------------------------
// Path A — self-register
// ---------------------------------------------------------------------------

const REGISTRATION_ERROR_COPY: Partial<Record<string, ErrorCopy>> = {
  ...FACE_IMAGE_ERROR_COPY,
  [RegistrationErrorCode.PLANT_NOT_FOUND]: {
    title: "Plant not found",
    message: "The selected plant is no longer available.",
    variant: "error",
    hint: "Refresh the form and pick a plant from the list.",
  },
  [RegistrationErrorCode.PLANT_MISMATCH]: {
    title: "Plant mismatch",
    message: "This employee belongs to a different plant.",
    variant: "error",
    hint: "Select the correct plant and submit again.",
  },
  [RegistrationErrorCode.ALREADY_ENROLLED]: {
    title: "Already enrolled",
    message: "This employee already has active face login.",
    variant: "warning",
    hint: "Use Authenticate instead of registering again.",
  },
  [RegistrationErrorCode.PENDING_REGISTRATION_EXISTS]: {
    title: "Registration pending",
    message: "A registration request is already waiting for admin review.",
    variant: "info",
    hint: "Wait for plant admin approval before trying again.",
  },
  [RegistrationErrorCode.DUPLICATE_FACE]: {
    title: "Face already registered",
    message: "This face matches another employee at your plant.",
    variant: "error",
    hint: "Verify the Employee ID or contact HR if this is your account.",
  },
  [RegistrationErrorCode.EMPLOYEE_INACTIVE]: {
    title: "Account inactive",
    message: "This employee record is inactive and cannot register.",
    variant: "warning",
    hint: "Contact HR to reactivate the account first.",
  },
  [RegistrationErrorCode.MISSING_PLANT_ID]: {
    title: "Plant required",
    message: "Select a plant before submitting registration.",
    variant: "warning",
  },
  [RegistrationErrorCode.MISSING_FULL_NAME]: {
    title: "Full name required",
    message: "Enter your full name as it appears on HR records.",
    variant: "warning",
  },
};

// ---------------------------------------------------------------------------
// Path B — kiosk admin login + enroll
// ---------------------------------------------------------------------------

const KIOSK_ADMIN_ERROR_COPY: Partial<Record<string, ErrorCopy>> = {
  ...FACE_IMAGE_ERROR_COPY,
  [KioskAdminErrorCode.INVALID_CREDENTIALS]: {
    title: "Admin sign-in failed",
    message: "The admin Employee ID or password is incorrect.",
    variant: "error",
    hint: "Use the same credentials as the Admin Portal, then try again.",
  },
  [KioskAdminErrorCode.ADMIN_INACTIVE]: {
    title: "Admin account inactive",
    message: "This admin account has been deactivated.",
    variant: "warning",
    hint: "Contact a super admin to restore desk access.",
  },
  [KioskAdminErrorCode.SESSION_EXPIRED]: {
    title: "Admin session expired",
    message: "Your kiosk admin session timed out.",
    variant: "warning",
    hint: "Sign in again to continue enrolling workers.",
  },
  [KioskAdminErrorCode.UNAUTHORIZED]: {
    title: "Session invalid",
    message: "Your admin session is no longer valid.",
    variant: "warning",
    hint: "Sign in again to continue.",
  },
  [KioskAdminErrorCode.PERMISSION_DENIED]: {
    title: "Not allowed",
    message: "You do not have permission for kiosk enrollment.",
    variant: "error",
    hint: "Use a plant admin account or contact IT.",
  },
  [KioskAdminErrorCode.KIOSK_PLANT_REQUIRED]: {
    title: "Plant admin required",
    message: "Kiosk enrollment needs a plant-scoped admin account.",
    variant: "error",
    hint: "Sign in with a PLANT_ADMIN user (not super admin) for this kiosk.",
  },
  [KioskAdminErrorCode.PLANT_ACCESS_DENIED]: {
    title: "Wrong plant",
    message: "You cannot enroll workers outside your assigned plant.",
    variant: "error",
    hint: "Use an admin account scoped to this plant.",
  },
  [KioskAdminErrorCode.MISSING_EMPLOYEE_ID]: {
    title: "Worker ID required",
    message: "Enter the worker Employee ID before capturing.",
    variant: "warning",
  },
  [KioskAdminErrorCode.EMPLOYEE_INACTIVE]: {
    title: "Worker inactive",
    message: "This worker is marked inactive and cannot be enrolled.",
    variant: "warning",
    hint: "Reactivate the employee in HR before enrolling at the kiosk.",
  },
  [KioskAdminErrorCode.ALREADY_ENROLLED]: {
    title: "Worker already enrolled",
    message: "This employee already has active face login.",
    variant: "warning",
    hint: "They can use Authenticate now — no need to enroll again.",
  },
  [KioskAdminErrorCode.PENDING_REGISTRATION_EXISTS]: {
    title: "Pending registration",
    message: "This worker already has a registration waiting for approval.",
    variant: "info",
    hint: "Approve or reject it in the Admin Portal first.",
  },
  [KioskAdminErrorCode.PLANT_MISMATCH]: {
    title: "Plant mismatch",
    message: "This employee belongs to a different plant than your session.",
    variant: "error",
    hint: "Verify the Employee ID or use the correct plant admin account.",
  },
  [KioskAdminErrorCode.DUPLICATE_FACE]: {
    title: "Face already used",
    message: "This face matches another employee at your plant.",
    variant: "error",
    hint: "Verify the worker Employee ID or check for duplicate enrollments.",
  },
};

const CAPTURE_FAILURE_COPY: Record<FaceCaptureFailure["code"], ErrorCopy> = {
  CAMERA_FAILED: {
    title: "Camera unavailable",
    message: "The kiosk could not access the camera.",
    variant: "error",
    hint: "Allow camera permission in the browser and reload the page.",
  },
  FACE_TIMEOUT: {
    title: "Face not seen in time",
    message: "We did not detect your face before the timer ran out.",
    variant: "warning",
    hint: "Stand in front of the camera and look at the screen.",
  },
  BLINK_TIMEOUT: {
    title: "Blink not detected",
    message: "Please blink once naturally to confirm you are present.",
    variant: "warning",
    hint: "Keep your eyes open, then blink once when prompted.",
  },
  BLINK_FAILED: {
    title: "Liveness check failed",
    message: "We could not confirm a live person at the camera.",
    variant: "warning",
    hint: "Try again in good lighting without photos or screens.",
  },
  CAPTURE_FAILED: {
    title: "Capture failed",
    message: "Something went wrong while taking the photo.",
    variant: "error",
    hint: "Hold still and try again.",
  },
  CANCELLED: {
    title: "Cancelled",
    message: "The capture was cancelled.",
    variant: "info",
    hint: "Tap Authenticate or Capture & enroll when you are ready.",
  },
  UNKNOWN: {
    title: "Capture error",
    message: "Something unexpected happened during capture.",
    variant: "error",
    hint: "Try again or reload the page.",
  },
};

const GENERIC_API_FAILURE: ErrorCopy = {
  title: "Something went wrong",
  message: "The request could not be completed.",
  variant: "error",
  hint: "Try again. Contact support if the problem continues.",
};

function feedbackFromApiErrorWithCatalog(
  error: FaceAuthApiError,
  catalogs: Array<Partial<Record<string, ErrorCopy>>>,
): SdkFeedbackPayload {
  if (error.code === "NETWORK_ERROR") {
    return buildPayload(
      {
        ...NETWORK_ERROR_COPY,
        message: error.detail || NETWORK_ERROR_COPY.message,
      },
      error.code,
      [{ label: "Tip", value: "Server may be offline or blocked by firewall." }],
    );
  }

  if (error.code === "API_NOT_CONFIGURED") {
    return buildPayload(
      {
        title: "Server not configured",
        message: "The face auth API URL is missing on this page.",
        variant: "error",
        hint: "Set apiBaseUrl when creating the SDK.",
      },
      error.code,
    );
  }

  const copy = lookupCopy(String(error.code), catalogs, {
    ...GENERIC_API_FAILURE,
    message: error.detail || GENERIC_API_FAILURE.message,
  });

  const details: SdkFeedbackPayload["details"] = [];
  if (error.httpStatus > 0) {
    details.push({ label: "Status", value: String(error.httpStatus) });
  }
  if (error.detail && error.detail !== copy.message) {
    details.push({ label: "Details", value: error.detail });
  }

  return buildPayload(copy, String(error.code), details);
}

export function feedbackFromAuthenticateResult(
  result: AuthenticateResult,
): SdkFeedbackPayload {
  const scoreLine = formatScore(result.score);
  const thresholdLine = formatScore(result.threshold);

  if (result.authenticated) {
    return {
      variant: "success",
      title: "Welcome back",
      message: result.message || "Face matched successfully.",
      code: "AUTHENTICATED",
      hint: "You may continue into the application.",
      details: [
        { label: "Employee ID", value: result.employeeId },
        { label: "Match score", value: scoreLine },
        { label: "Threshold", value: thresholdLine },
      ],
    };
  }

  return {
    variant: "warning",
    title: "Face did not match",
    message: result.message || "The photo did not match this Employee ID.",
    code: "AUTH_DENIED",
    hint: "Try again or contact your supervisor if you recently re-enrolled.",
    details: [
      { label: "Employee ID", value: result.employeeId },
      { label: "Match score", value: scoreLine },
      { label: "Threshold", value: thresholdLine },
    ],
  };
}

export function feedbackFromRegisterResult(
  result: RegisterResult,
): SdkFeedbackPayload {
  return {
    variant: "success",
    title: "Registration submitted",
    message: result.message || "Your request was sent for plant admin review.",
    code: result.status,
    hint: "You can log in with face auth after approval.",
    details: [
      { label: "Employee ID", value: result.employeeId },
      { label: "Full name", value: result.submittedFullName },
      { label: "Status", value: result.status },
      { label: "Request ID", value: result.requestId },
    ],
  };
}

export function feedbackFromCaptureFailure(
  failure: FaceCaptureFailure,
): SdkFeedbackPayload {
  const copy =
    CAPTURE_FAILURE_COPY[failure.code] ?? CAPTURE_FAILURE_COPY.UNKNOWN;

  return buildPayload(
    {
      ...copy,
      message: failure.message || copy.message,
    },
    failure.code,
    [{ label: "Step", value: failure.phase }],
  );
}

export function feedbackFromApiError(error: FaceAuthApiError): SdkFeedbackPayload {
  return feedbackFromApiErrorWithCatalog(error, [
    AUTH_ERROR_COPY,
    REGISTRATION_ERROR_COPY,
    KIOSK_ADMIN_ERROR_COPY,
    FACE_IMAGE_ERROR_COPY,
  ]);
}

export function feedbackFromRegistrationApiError(
  error: FaceAuthApiError,
): SdkFeedbackPayload {
  return feedbackFromApiErrorWithCatalog(error, [
    REGISTRATION_ERROR_COPY,
    FACE_IMAGE_ERROR_COPY,
  ]);
}

export function feedbackFromKioskAdminApiError(
  error: FaceAuthApiError,
): SdkFeedbackPayload {
  return feedbackFromApiErrorWithCatalog(error, [
    KIOSK_ADMIN_ERROR_COPY,
    FACE_IMAGE_ERROR_COPY,
  ]);
}

export function feedbackFromUnknownError(error: unknown): SdkFeedbackPayload {
  if (isFaceAuthApiError(error)) {
    return feedbackFromApiError(error);
  }

  if (error instanceof Error) {
    const code =
      typeof (error as Error & { code?: string }).code === "string"
        ? (error as Error & { code?: string }).code
        : undefined;

    if (code && code in CAPTURE_FAILURE_COPY) {
      return feedbackFromCaptureFailure({
        code: code as FaceCaptureFailure["code"],
        message: error.message,
        phase: "error",
      });
    }

    if (code === "CANCELLED") {
      return buildPayload(CAPTURE_FAILURE_COPY.CANCELLED, code);
    }

    return buildPayload(
      {
        title: "Unexpected error",
        message: error.message || GENERIC_API_FAILURE.message,
        variant: "error",
        hint: GENERIC_API_FAILURE.hint,
      },
      code,
    );
  }

  return buildPayload(GENERIC_API_FAILURE, "UNKNOWN");
}

export function feedbackRegistrationCancelled(): SdkFeedbackPayload {
  return buildPayload(
    {
      title: "Registration cancelled",
      message: "No registration was submitted.",
      variant: "info",
      hint: "Tap Authenticate when you are ready to capture a new photo.",
    },
    "CANCELLED",
  );
}

export function feedbackRegistrationFormError(message: string): SdkFeedbackPayload {
  return buildPayload(
    {
      title: "Could not register",
      message,
      variant: "error",
      hint: "Fix the highlighted fields and submit again.",
    },
    "REGISTER_FORM_ERROR",
  );
}

export function feedbackFromKioskAdminEnroll(
  result: KioskAdminEnrollResult,
): SdkFeedbackPayload {
  return {
    variant: "success",
    title: "Worker enrolled",
    message: result.message || "Face login is now active for this employee.",
    code: result.enrollmentStatus,
    hint: "They can use Authenticate immediately — enroll the next worker or end session.",
    details: [
      { label: "Employee ID", value: result.employeeId },
      { label: "Plant ID", value: result.plantId },
      { label: "Enrollment", value: result.enrollmentStatus },
      { label: "Request ID", value: result.requestId },
    ],
  };
}

export function feedbackAdminKioskSessionEnded(): SdkFeedbackPayload {
  return buildPayload(
    {
      title: "Admin session ended",
      message: "Kiosk enrollment mode is closed.",
      variant: "info",
      hint: "Workers can use Authenticate for normal face login.",
    },
    "ADMIN_KIOSK_SESSION_ENDED",
  );
}

export function feedbackAdminKioskLoginSuccess(employeeId: string): SdkFeedbackPayload {
  return buildPayload(
    {
      title: "Admin signed in",
      message: `Signed in as ${employeeId}.`,
      variant: "success",
      hint: "Enter a worker Employee ID, then Capture & enroll.",
    },
    "ADMIN_KIOSK_LOGIN",
  );
}

export function isCaptureRelatedErrorCode(code: string | undefined): boolean {
  if (!code) {
    return false;
  }
  return code in CAPTURE_FAILURE_COPY;
}

export type FeedbackErrorScope = "general" | "registration" | "kiosk";

/** Single-line message for inline overlay alerts (matches toast copy). */
export function userFacingErrorMessage(
  error: unknown,
  scope: FeedbackErrorScope = "general",
): string {
  if (isFaceAuthApiError(error)) {
    switch (scope) {
      case "kiosk":
        return feedbackFromKioskAdminApiError(error).message;
      case "registration":
        return feedbackFromRegistrationApiError(error).message;
      default:
        return feedbackFromApiError(error).message;
    }
  }
  return feedbackFromUnknownError(error).message;
}
