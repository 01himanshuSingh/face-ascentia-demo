"""
Shared application exceptions (Debian FastAPI).

System design
-------------
Raise domain exceptions in repositories / services.
Map once at the HTTP edge (main.py exception handler) → AuthErrorResponse JSON.

  repositories / face services
        ↓  raise AppError subclass
  FastAPI handler
        ↓  { "detail": "...", "code": "EMPLOYEE_NOT_FOUND" }
  FaceAuthSDK / Mendix
        ↓  branch on `code`; success path still uses AuthenticateResponse

Rules
-----
1. HTTP status lives on the exception — routes stay thin.
2. `code` must match schemas.auth.AuthErrorCode (stable for the npm SDK).
3. Wrong-face match (authenticated=false) is NOT an exception — return 200
   AuthenticateResponse. Exceptions are for "could not complete verification".
4. Keep this module free of SQLAlchemy / OpenCV / MediaPipe imports so any
   layer can raise without pulling heavy deps.

Extensibility
-------------
Week 1: auth errors below.
Later: RegistrationError / AdminError subclasses of AppError with their own
code enums — same handler pattern, no rewrite of auth.
"""

from __future__ import annotations

from typing import Any

from app.schemas.auth import AuthErrorCode, AuthErrorResponse


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
        # Optional structured context for logs / future API fields — never secrets.
        self.details = details or {}

    def to_error_response(self) -> AuthErrorResponse:
        """Build the HTTP error body defined in schemas.auth."""
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
# Authentication domain (Week 1 1:1 path)
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


__all__ = [
    "AppError",
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
]
