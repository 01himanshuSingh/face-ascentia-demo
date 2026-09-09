"""
Authentication service (POST /authenticate orchestration).

Architecture
------------
  auth route (HTTP)
        ↓
  AuthenticationService.authenticate(...)     ← this module
        ↓
  employee_repository  +  enrollment_repository  (PostgreSQL)
        ↓
  face_verification.verify_image_against_reference(...)
        ↓
  Auth Log write (audit_log action=LOGIN, text metadata only)
        ↓
  AuthenticateResponse (HTTP 200)

System boundary
---------------
- IN:  employee_id, image bytes (+ optional content_type from multipart)
- OUT: AuthenticateResponse OR AuthError subclass (raised to main.py)

Wrong face → authenticated=false on HTTP 200 (not an exception) + LOGIN FAILURE.
Missing employee / enrollment / bad image → AuthError + LOGIN FAILURE when plant known.

Auth Log (append-only)
----------------------
Every attempt that resolves to a known employee.plant_id writes one ``LOGIN`` row:
  metadata.result       → AuthLogResult
  metadata.reason_code  → AuthLogReasonCode
  metadata.score / threshold when a 1:1 score was computed (portal shows %)

``EMPLOYEE_NOT_FOUND`` / missing id / pre-lookup validation cannot set plant_id
(audit_log.plant_id is required; actor_id FK needs a real employee) — those
attempts are application-logged only until a future plant-scoped kiosk context
exists. Compliance Audit chips never include LOGIN.

Does NOT
--------
- Capture camera frames (SDK)
- Parse multipart form (route)
- Run 1:N gallery search
- Store face bytes / embeddings in audit metadata
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Sequence

from sqlalchemy.orm import Session

from app.common.enums import (
    AUTH_LOG_METADATA_MESSAGE_KEY,
    AUTH_LOG_METADATA_REASON_CODE_KEY,
    AUTH_LOG_METADATA_RESULT_KEY,
    AUTH_LOG_METADATA_SCORE_KEY,
    AUTH_LOG_METADATA_THRESHOLD_KEY,
    AuditAction,
    AuthLogReasonCode,
    AuthLogResult,
    EmployeeStatus,
)
from app.common.exceptions import (
    ActiveEnrollmentNotFoundError,
    AuthError,
    EmployeeInactiveError,
    EmployeeNotFoundError,
    MissingEmployeeIdError,
    UnsupportedImageTypeError,
)
from app.core.config import Settings, settings
from app.repositories import audit_repository, employee_repository, enrollment_repository
from app.schemas.auth import AuthErrorCode, AuthenticateFormFields, AuthenticateResponse
from app.services.face_verification import (
    FaceVerificationService,
    get_shared_face_verification_service,
)

logger = logging.getLogger(__name__)

_ACCEPTED_IMAGE_TYPES = AuthenticateFormFields().accepted_image_types
_AUTH_LOG_TARGET_TYPE = "employee"
_AUTH_LOG_ACTOR_ROLE = "KIOSK"


class AuthenticationService:
    """
    Coordinates DB lookup + face verification for the Mendix authenticate flow.

    Dependencies are injectable for tests; production uses shared face verification.
    """

    def __init__(
        self,
        *,
        face_verification: FaceVerificationService,
        app_settings: Settings | None = None,
    ) -> None:
        self._face_verification = face_verification
        self._settings = app_settings or settings

    def authenticate(
        self,
        db: Session,
        *,
        employee_id: str,
        image_bytes: bytes,
        content_type: str | None = None,
    ) -> AuthenticateResponse:
        """
        Authenticate pipeline for one Employee ID + one kiosk still.

        Args:
            db: Request-scoped SQLAlchemy session.
            employee_id: Business ID from Mendix.
            image_bytes: Best JPEG from SDK burst capture.
            content_type: Multipart MIME type when provided by the route.

        Returns:
            AuthenticateResponse (including authenticated=false for wrong face).

        Raises:
            AuthError subclasses when verification cannot run to a score.
        """
        normalized_id = self._normalize_employee_id(employee_id)
        plant_id: uuid.UUID | None = None

        try:
            self._validate_content_type(content_type)

            employee = employee_repository.get_by_id(db, normalized_id)
            if employee is None:
                raise EmployeeNotFoundError(normalized_id)

            plant_id = employee.plant_id

            if employee.status != EmployeeStatus.ACTIVE.value:
                raise EmployeeInactiveError(normalized_id)

            enrollment = enrollment_repository.get_active_by_employee_id(
                db, normalized_id
            )
            if enrollment is None:
                raise ActiveEnrollmentNotFoundError(normalized_id)

            reference_embedding = _coerce_embedding(enrollment.embedding)

            verification = self._face_verification.verify_image_against_reference(
                image_bytes,
                reference_embedding,
            )

            authenticated = verification.matched
            message = self._result_message(
                authenticated=authenticated,
                full_name=employee.full_name,
            )
            result = (
                AuthLogResult.SUCCESS if authenticated else AuthLogResult.FAILURE
            )
            reason = (
                AuthLogReasonCode.MATCH_OK
                if authenticated
                else AuthLogReasonCode.FACE_MISMATCH
            )

            logger.info(
                "auth | employee=%s | face_score=%.3f | threshold=%.3f | match=%s | detect=%.3f",
                normalized_id,
                verification.score,
                verification.threshold,
                "YES" if authenticated else "NO",
                verification.detection_score,
            )

            response = AuthenticateResponse(
                employee_id=normalized_id,
                authenticated=authenticated,
                score=verification.score,
                threshold=verification.threshold,
                message=message,
                full_name=employee.full_name if authenticated else None,
                model_version=verification.live_model_version,
                enrollment_model_version=enrollment.model_version,
            )

            self._commit_login_attempt(
                db,
                plant_id=plant_id,
                employee_id=normalized_id,
                result=result,
                reason_code=reason,
                message=message,
                score=verification.score,
                threshold=verification.threshold,
            )
            return response

        except AuthError as exc:
            if plant_id is not None:
                self._commit_login_attempt(
                    db,
                    plant_id=plant_id,
                    employee_id=normalized_id,
                    result=AuthLogResult.FAILURE,
                    reason_code=_reason_from_auth_error(exc),
                    message=str(exc),
                    score=None,
                    threshold=None,
                )
            else:
                logger.info(
                    "auth | employee=%s | failure=%s | auth_log=skipped (no plant_id)",
                    normalized_id,
                    exc.auth_code.value,
                )
            raise

    def _commit_login_attempt(
        self,
        db: Session,
        *,
        plant_id: uuid.UUID,
        employee_id: str,
        result: AuthLogResult,
        reason_code: AuthLogReasonCode,
        message: str,
        score: float | None,
        threshold: float | None,
    ) -> None:
        """Append LOGIN row and commit. Never fails the authenticate response."""
        try:
            self._record_login_attempt(
                db,
                plant_id=plant_id,
                employee_id=employee_id,
                result=result,
                reason_code=reason_code,
                message=message,
                score=score,
                threshold=threshold,
            )
            db.commit()
        except Exception:
            logger.exception(
                "auth | LOGIN audit write failed | employee=%s | reason=%s",
                employee_id,
                reason_code.value,
            )
            db.rollback()

    @staticmethod
    def _record_login_attempt(
        db: Session,
        *,
        plant_id: uuid.UUID,
        employee_id: str,
        result: AuthLogResult,
        reason_code: AuthLogReasonCode,
        message: str,
        score: float | None,
        threshold: float | None,
    ) -> None:
        """Insert one text-only LOGIN row. Caller owns commit."""
        metadata: dict[str, Any] = {
            AUTH_LOG_METADATA_RESULT_KEY: result.value,
            AUTH_LOG_METADATA_REASON_CODE_KEY: reason_code.value,
            AUTH_LOG_METADATA_MESSAGE_KEY: message,
        }
        if score is not None:
            metadata[AUTH_LOG_METADATA_SCORE_KEY] = float(score)
        if threshold is not None:
            metadata[AUTH_LOG_METADATA_THRESHOLD_KEY] = float(threshold)

        audit_repository.create_entry(
            db,
            action=AuditAction.LOGIN.value,
            plant_id=plant_id,
            actor_id=employee_id,
            actor_role=_AUTH_LOG_ACTOR_ROLE,
            target_type=_AUTH_LOG_TARGET_TYPE,
            target_id=employee_id,
            metadata=metadata,
        )

    @staticmethod
    def _normalize_employee_id(employee_id: str) -> str:
        normalized = (employee_id or "").strip()
        if not normalized:
            raise MissingEmployeeIdError()
        return normalized

    @staticmethod
    def _validate_content_type(content_type: str | None) -> None:
        if not content_type:
            return
        normalized = content_type.split(";", 1)[0].strip().lower()
        if normalized not in _ACCEPTED_IMAGE_TYPES:
            raise UnsupportedImageTypeError(content_type)

    @staticmethod
    def _result_message(*, authenticated: bool, full_name: str) -> str:
        if authenticated:
            return f"Authentication successful. Welcome, {full_name}."
        return (
            "Face did not match the enrolled template for this Employee ID."
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _reason_from_auth_error(exc: AuthError) -> AuthLogReasonCode:
    """Map AuthErrorCode → AuthLogReasonCode (same string values where aligned)."""
    code: AuthErrorCode = exc.auth_code
    try:
        return AuthLogReasonCode(code.value)
    except ValueError:
        return AuthLogReasonCode.UNKNOWN


def _coerce_embedding(values: Any) -> list[float]:
    """
    Normalize pgvector / numpy / list storage to plain floats for verification.
    """
    if values is None:
        return []
    if hasattr(values, "tolist"):
        sequence: Sequence[Any] = values.tolist()
    elif isinstance(values, Sequence) and not isinstance(values, (str, bytes)):
        sequence = values
    else:
        sequence = [values]
    return [float(x) for x in sequence]


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def create_authentication_service(
    *,
    face_verification: FaceVerificationService | None = None,
    app_settings: Settings | None = None,
) -> AuthenticationService:
    return AuthenticationService(
        face_verification=face_verification or get_shared_face_verification_service(),
        app_settings=app_settings,
    )


_shared_authentication_service: AuthenticationService | None = None


def get_shared_authentication_service() -> AuthenticationService:
    global _shared_authentication_service
    if _shared_authentication_service is None:
        _shared_authentication_service = create_authentication_service()
    return _shared_authentication_service


__all__ = [
    "AuthenticationService",
    "create_authentication_service",
    "get_shared_authentication_service",
]
