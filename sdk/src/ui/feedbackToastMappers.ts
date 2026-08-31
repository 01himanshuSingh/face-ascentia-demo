import { FaceAuthApiError, isFaceAuthApiError } from "../api/FaceAuthClient";
import type { AuthenticateResult, FaceCaptureFailure } from "../types/auth.types";
import type { RegisterResult } from "../types/registration.types";
import type { SdkFeedbackPayload } from "./feedbackToast.types";

function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return value.toFixed(3);
}

export function feedbackFromAuthenticateResult(
  result: AuthenticateResult,
): SdkFeedbackPayload {
  const scoreLine = formatScore(result.score);
  const thresholdLine = formatScore(result.threshold);
  const passed =
    result.score !== null && result.score !== undefined
      ? result.score >= result.threshold
      : result.authenticated;

  if (result.authenticated) {
    return {
      variant: "success",
      title: "Authentication successful",
      message: result.message,
      code: "AUTHENTICATED",
      details: [
        { label: "Employee ID", value: result.employeeId },
        { label: "Similarity score", value: scoreLine },
        { label: "Server threshold", value: thresholdLine },
        { label: "Match", value: passed ? "Pass" : "Pass" },
      ],
    };
  }

  return {
    variant: "warning",
    title: "Face not matched",
    message: result.message,
    code: "AUTH_DENIED",
    details: [
      { label: "Employee ID", value: result.employeeId },
      { label: "Similarity score", value: scoreLine },
      { label: "Server threshold", value: thresholdLine },
      { label: "Match", value: "Fail (below threshold)" },
    ],
  };
}

export function feedbackFromRegisterResult(
  result: RegisterResult,
): SdkFeedbackPayload {
  return {
    variant: "success",
    title: "Registration submitted",
    message: result.message,
    code: result.status,
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
  const titles: Record<FaceCaptureFailure["code"], string> = {
    CAMERA_FAILED: "Camera error",
    FACE_TIMEOUT: "Face not detected in time",
    BLINK_TIMEOUT: "Blink timeout",
    BLINK_FAILED: "Liveness check failed",
    CAPTURE_FAILED: "Capture failed",
    CANCELLED: "Capture cancelled",
    UNKNOWN: "Capture error",
  };

  const variant =
    failure.code === "CANCELLED"
      ? "info"
      : failure.code === "FACE_TIMEOUT" || failure.code === "BLINK_TIMEOUT"
        ? "warning"
        : "error";

  return {
    variant,
    title: titles[failure.code] ?? "Capture error",
    message: failure.message,
    code: failure.code,
    details: [{ label: "Phase", value: failure.phase }],
  };
}

export function feedbackFromApiError(error: FaceAuthApiError): SdkFeedbackPayload {
  const registerEligible =
    error.code === "ENROLLMENT_NOT_FOUND" || error.code === "EMPLOYEE_NOT_FOUND";

  return {
    variant: registerEligible ? "info" : "error",
    title: registerEligible ? "Registration required" : "Request failed",
    message: error.detail,
    code: String(error.code),
    details: [
      { label: "HTTP status", value: String(error.httpStatus) },
      ...(registerEligible
        ? [{ label: "Next step", value: "Complete registration form" }]
        : []),
    ],
  };
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

    if (code === "CANCELLED") {
      return {
        variant: "info",
        title: "Cancelled",
        message: error.message,
        code,
      };
    }

    return {
      variant: "error",
      title: "Unexpected error",
      message: error.message,
      code,
    };
  }

  return {
    variant: "error",
    title: "Unexpected error",
    message: "Something went wrong. Please try again.",
  };
}

export function feedbackRegistrationCancelled(): SdkFeedbackPayload {
  return {
    variant: "info",
    title: "Registration cancelled",
    message: "No registration was submitted. Tap Authenticate to capture a new photo.",
    code: "CANCELLED",
  };
}

export function feedbackRegistrationFormError(message: string): SdkFeedbackPayload {
  return {
    variant: "error",
    title: "Registration failed",
    message,
    code: "REGISTER_FORM_ERROR",
  };
}
