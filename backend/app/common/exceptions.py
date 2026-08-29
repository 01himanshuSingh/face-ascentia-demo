"""
Shared application exceptions (Debian FastAPI).

System design
-------------
Raise domain exceptions in repositories / services.
Map once at the HTTP edge (main.py exception handler) → stable JSON error bodies.

  services / repositories
        ↓  raise AuthError or RegistrationError
  AppError.to_error_response()
        ↓  AuthErrorResponse  |  RegistrationErrorResponse
  FaceAuthSDK / Mendix
        ↓  branch on `code`

Rules
-----
1. HTTP status lives on the exception — routes stay thin.
2. `code` must match the endpoint's schema enum (AuthErrorCode / RegistrationErrorCode).
3. Wrong-face match (authenticated=false) is NOT an exception — return 200 AuthenticateResponse.
4. No SQLAlchemy / OpenCV / MediaPipe imports in this module.

Registration note
-----------------
Face pipeline (detect / embed) stays in face_verification and raises AuthError.
RegistrationService catches AuthError and re-labels via RegistrationError.from_auth_error()
so POST /register always returns RegistrationErrorCode — no duplicate image exception classes.
"""

from __future__ import annotations

from typing import Any

from app.schemas.auth import AuthErrorCode, AuthErrorResponse
from app.schemas.admin import AdminErrorCode, AdminErrorResponse
from app.schemas.registration import RegistrationErrorCode, RegistrationErrorResponse


class AppError(Exception):
    """
    Base plant-API error.

    All user-facing failures that should become JSON error bodies inherit here.
    Unexpected bugs stay as unhandled 500s (do not wrap everything in AppError).
    """

    def __init__(
        self,
        message: str,
        *,
        code: str,
        http_status: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.http_status = http_status
        self.details = details or {}

    def to_error_response(
        self,
    ) -> AuthErrorResponse | RegistrationErrorResponse | AdminErrorResponse:
        """Build the HTTP error body for the endpoint domain."""
        if isinstance(self, AdminError):
            return AdminErrorResponse(detail=self.message, code=self.admin_code)
        if isinstance(self, RegistrationError):
            return RegistrationErrorResponse(
                detail=self.message,
                code=self.registration_code,
            )
        if isinstance(self, AuthError):
            return AuthErrorResponse(detail=self.message, code=self.auth_code)
        return AuthErrorResponse(
            detail=self.message,
            code=AuthErrorCode(self.code),
        )

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"code={self.code!r}, http_status={self.http_status}, "
            f"message={self.message!r})"
        )


# ---------------------------------------------------------------------------
# Authentication domain (POST /authenticate)
# ---------------------------------------------------------------------------


class AuthError(AppError):
    """Namespace for authenticate-pipeline failures."""

    def __init__(
        self,
        message: str,
        *,
        code: AuthErrorCode,
        http_status: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            message,
            code=code.value,
            http_status=http_status,
            details=details,
        )
        self.auth_code = code


class MissingEmployeeIdError(AuthError):
    def __init__(self) -> None:
        super().__init__(
            "employee_id is required.",
            code=AuthErrorCode.MISSING_EMPLOYEE_ID,
            http_status=400,
        )


class EmployeeNotFoundError(AuthError):
    def __init__(self, employee_id: str) -> None:
        super().__init__(
            f"Employee '{employee_id}' was not found.",
            code=AuthErrorCode.EMPLOYEE_NOT_FOUND,
            http_status=404,
            details={"employee_id": employee_id},
        )


class EmployeeInactiveError(AuthError):
    def __init__(self, employee_id: str) -> None:
        super().__init__(
            f"Employee '{employee_id}' is inactive.",
            code=AuthErrorCode.EMPLOYEE_INACTIVE,
            http_status=403,
            details={"employee_id": employee_id},
        )


class ActiveEnrollmentNotFoundError(AuthError):
    def __init__(self, employee_id: str) -> None:
        super().__init__(
            f"No ACTIVE face enrollment for employee '{employee_id}'.",
            code=AuthErrorCode.ENROLLMENT_NOT_FOUND,
            http_status=404,
            details={"employee_id": employee_id},
        )


class EmptyImageError(AuthError):
    def __init__(self) -> None:
        super().__init__(
            "Empty image payload.",
            code=AuthErrorCode.EMPTY_IMAGE,
            http_status=400,
        )


class InvalidImageError(AuthError):
    def __init__(self, message: str = "Could not decode image bytes.") -> None:
        super().__init__(
            message,
            code=AuthErrorCode.INVALID_IMAGE,
            http_status=400,
        )


class UnsupportedImageTypeError(AuthError):
    def __init__(self, content_type: str) -> None:
        super().__init__(
            f"Unsupported image type: {content_type}",
            code=AuthErrorCode.UNSUPPORTED_IMAGE_TYPE,
            http_status=400,
            details={"content_type": content_type},
        )


class ImageTooLargeError(AuthError):
    def __init__(self, *, max_bytes: int) -> None:
        super().__init__(
            f"Image exceeds maximum allowed size ({max_bytes} bytes).",
            code=AuthErrorCode.IMAGE_TOO_LARGE,
            http_status=400,
            details={"max_bytes": max_bytes},
        )


class NoFaceDetectedError(AuthError):
    def __init__(self) -> None:
        super().__init__(
            "No face detected in the captured image.",
            code=AuthErrorCode.NO_FACE,
            http_status=400,
        )


class MultipleFacesError(AuthError):
    def __init__(self) -> None:
        super().__init__(
            "Multiple faces detected. Only one face is allowed.",
            code=AuthErrorCode.MULTIPLE_FACES,
            http_status=400,
        )


class FaceDetectFailedError(AuthError):
    def __init__(self, message: str = "Face detection failed.") -> None:
        super().__init__(
            message,
            code=AuthErrorCode.DETECT_FAILED,
            http_status=400,
        )


class FaceEmbedFailedError(AuthError):
    def __init__(self, message: str = "Face embedding failed.") -> None:
        super().__init__(
            message,
            code=AuthErrorCode.EMBED_FAILED,
            http_status=400,
        )


class EmbeddingDimensionMismatchError(AuthError):
    def __init__(self, *, got: int, expected: int) -> None:
        super().__init__(
            f"Embedding dimension mismatch: got {got}, expected {expected}.",
            code=AuthErrorCode.EMBEDDING_DIMENSION_MISMATCH,
            http_status=500,
            details={"got": got, "expected": expected},
        )


# ---------------------------------------------------------------------------
# Registration domain (POST /register — Path A kiosk self-register)
# ---------------------------------------------------------------------------


class RegistrationError(AppError):
    """
    Namespace for employee self-register failures.

    Registration-only guard failures use named subclasses below.
    Shared face-pipeline failures are re-labeled from AuthError via from_auth_error().
    """

    def __init__(
        self,
        message: str,
        *,
        code: RegistrationErrorCode,
        http_status: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            message,
            code=code.value,
            http_status=http_status,
            details=details,
        )
        self.registration_code = code

    @classmethod
    def from_auth_error(cls, exc: AuthError) -> RegistrationError:
        """
        Map AuthError from face_verification to RegistrationErrorResponse codes.

        Shared codes (NO_FACE, EMBED_FAILED, …) use identical string values in
        RegistrationErrorCode — only the response schema enum differs per endpoint.
        """
        try:
            reg_code = RegistrationErrorCode(exc.code)
        except ValueError as err:
            raise ValueError(
                f"AuthError code {exc.code!r} has no RegistrationErrorCode mapping."
            ) from err
        return cls(
            exc.message,
            code=reg_code,
            http_status=exc.http_status,
            details=exc.details or None,
        )


class RegistrationMissingEmployeeIdError(RegistrationError):
    def __init__(self) -> None:
        super().__init__(
            "employee_id is required.",
            code=RegistrationErrorCode.MISSING_EMPLOYEE_ID,
            http_status=400,
        )


class RegistrationMissingFullNameError(RegistrationError):
    def __init__(self) -> None:
        super().__init__(
            "full_name is required.",
            code=RegistrationErrorCode.MISSING_FULL_NAME,
            http_status=400,
        )


class RegistrationMissingPlantIdError(RegistrationError):
    def __init__(self) -> None:
        super().__init__(
            "plant_id is required.",
            code=RegistrationErrorCode.MISSING_PLANT_ID,
            http_status=400,
        )


class RegistrationPlantNotFoundError(RegistrationError):
    def __init__(self, plant_id: str) -> None:
        super().__init__(
            f"Plant '{plant_id}' was not found or is inactive.",
            code=RegistrationErrorCode.PLANT_NOT_FOUND,
            http_status=404,
            details={"plant_id": plant_id},
        )


class RegistrationPlantMismatchError(RegistrationError):
    def __init__(self, *, employee_id: str, expected_plant_id: str) -> None:
        super().__init__(
            f"Employee '{employee_id}' belongs to a different plant.",
            code=RegistrationErrorCode.PLANT_MISMATCH,
            http_status=409,
            details={"employee_id": employee_id, "expected_plant_id": expected_plant_id},
        )


class RegistrationEmployeeNotFoundError(RegistrationError):
    def __init__(self, employee_id: str) -> None:
        super().__init__(
            f"Employee '{employee_id}' was not found.",
            code=RegistrationErrorCode.EMPLOYEE_NOT_FOUND,
            http_status=404,
            details={"employee_id": employee_id},
        )


class RegistrationEmployeeInactiveError(RegistrationError):
    def __init__(self, employee_id: str) -> None:
        super().__init__(
            f"Employee '{employee_id}' is inactive.",
            code=RegistrationErrorCode.EMPLOYEE_INACTIVE,
            http_status=403,
            details={"employee_id": employee_id},
        )


class AlreadyEnrolledError(RegistrationError):
    """Employee already has ACTIVE enrollment — cannot self-register."""

    def __init__(self, employee_id: str) -> None:
        super().__init__(
            f"Employee '{employee_id}' already has an ACTIVE face enrollment.",
            code=RegistrationErrorCode.ALREADY_ENROLLED,
            http_status=409,
            details={"employee_id": employee_id},
        )


class PendingRegistrationExistsError(RegistrationError):
    """At most one PENDING request per employee (idx_one_pending_per_emp)."""

    def __init__(self, employee_id: str) -> None:
        super().__init__(
            f"A PENDING registration request already exists for employee '{employee_id}'.",
            code=RegistrationErrorCode.PENDING_REGISTRATION_EXISTS,
            http_status=409,
            details={"employee_id": employee_id},
        )


class DuplicateFaceError(RegistrationError):
    """Live embedding matches another employee's ACTIVE enrollment (1:N guard)."""

    def __init__(self, *, matched_employee_id: str | None = None) -> None:
        details: dict[str, Any] = {}
        if matched_employee_id is not None:
            details["matched_employee_id"] = matched_employee_id
        super().__init__(
            "This face matches an existing enrollment for another employee.",
            code=RegistrationErrorCode.DUPLICATE_FACE,
            http_status=409,
            details=details or None,
        )


# ---------------------------------------------------------------------------
# Admin Portal domain
# ---------------------------------------------------------------------------


class AdminError(AppError):
    def __init__(
        self,
        message: str,
        *,
        code: AdminErrorCode,
        http_status: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            message,
            code=code.value,
            http_status=http_status,
            details=details,
        )
        self.admin_code = code


__all__ = [
    "AppError",
    "AdminError",
    "AuthError",
    "MissingEmployeeIdError",
    "EmployeeNotFoundError",
    "EmployeeInactiveError",
    "ActiveEnrollmentNotFoundError",
    "EmptyImageError",
    "InvalidImageError",
    "UnsupportedImageTypeError",
    "ImageTooLargeError",
    "NoFaceDetectedError",
    "MultipleFacesError",
    "FaceDetectFailedError",
    "FaceEmbedFailedError",
    "EmbeddingDimensionMismatchError",
    "RegistrationError",
    "RegistrationMissingEmployeeIdError",
    "RegistrationEmployeeNotFoundError",
    "RegistrationEmployeeInactiveError",
    "AlreadyEnrolledError",
    "PendingRegistrationExistsError",
    "DuplicateFaceError",
]
