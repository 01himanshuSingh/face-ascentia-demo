"""
Registration service (POST /register — Path A kiosk self-register).

Registration-first model: employee row is NOT required at submit time.
Plant + full name come from the kiosk; HR validates offline on admin APPROVE.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from app.common.enums import EmployeeStatus, RegistrationSource, RegistrationStatus
from app.common.exceptions import (
    AlreadyEnrolledError,
    AuthError,
    PendingRegistrationExistsError,
    RegistrationEmployeeInactiveError,
    RegistrationError,
    RegistrationMissingEmployeeIdError,
    RegistrationMissingFullNameError,
    RegistrationMissingPlantIdError,
    RegistrationPlantMismatchError,
    RegistrationPlantNotFoundError,
)
from app.core.config import Settings, get_settings, settings
from app.repositories import (
    employee_repository,
    enrollment_repository,
    plant_repository,
    raw_image_repository,
    registration_repository,
)
from app.schemas.registration import (
    RegisterFormFields,
    RegisterResponse,
    RegistrationErrorCode,
)
from app.services.duplicate_check import (
    DuplicateCheckService,
    get_shared_duplicate_check_service,
)
from app.services.face_verification import (
    FaceVerificationService,
    get_shared_face_verification_service,
)

logger = logging.getLogger(__name__)

_ACCEPTED_IMAGE_TYPES = RegisterFormFields().accepted_image_types

_REGISTER_SUCCESS_MESSAGE = (
    "Registration submitted. Please wait for admin approval before logging in."
)


class RegistrationService:
    """Coordinates registration-first kiosk self-register (KIOSK, PENDING)."""

    def __init__(
        self,
        *,
        face_verification: FaceVerificationService,
        duplicate_check: DuplicateCheckService,
        app_settings: Settings | None = None,
    ) -> None:
        self._face_verification = face_verification
        self._duplicate_check = duplicate_check
        self._settings = app_settings or settings

    def register(
        self,
        db: Session,
        *,
        employee_id: str,
        plant_id: uuid.UUID | str,
        full_name: str,
        image_bytes: bytes,
        content_type: str | None = None,
        kiosk_id: str | None = None,
        session_id: str | None = None,
    ) -> RegisterResponse:
        normalized_id = self._normalize_employee_id(employee_id)
        normalized_name = self._normalize_full_name(full_name)
        resolved_plant_id = self._resolve_plant_id(plant_id)
        self._validate_content_type(content_type)

        plant = plant_repository.get_by_id(db, resolved_plant_id)
        if plant is None or not plant.is_active:
            raise RegistrationPlantNotFoundError(str(resolved_plant_id))

        employee = employee_repository.get_by_id(db, normalized_id)
        if employee is not None:
            if employee.status != EmployeeStatus.ACTIVE.value:
                raise RegistrationEmployeeInactiveError(normalized_id)
            if employee.plant_id != resolved_plant_id:
                raise RegistrationPlantMismatchError(
                    employee_id=normalized_id,
                    expected_plant_id=str(employee.plant_id),
                )
            if enrollment_repository.get_active_by_employee_id(db, normalized_id) is not None:
                raise AlreadyEnrolledError(normalized_id)

        if registration_repository.get_pending_by_employee_id(db, normalized_id) is not None:
            raise PendingRegistrationExistsError(normalized_id)

        live = self._extract_live_embedding(image_bytes)

        self._duplicate_check.assert_no_duplicate_in_plant(
            db,
            plant_id=resolved_plant_id,
            employee_id=normalized_id,
            live_embedding=live,
        )

        try:
            request = registration_repository.create_pending(
                db,
                employee_id=normalized_id,
                plant_id=resolved_plant_id,
                submitted_full_name=normalized_name,
                source=RegistrationSource.KIOSK,
                embedding=list(live.vector),
                kiosk_id=kiosk_id,
                session_id=session_id,
            )
            raw_image_repository.create_for_request(
                db,
                request_id=request.request_id,
                image_data=image_bytes,
            )
            db.commit()
            db.refresh(request)
        except Exception:
            db.rollback()
            raise

        logger.info(
            "register | employee=%s | request_id=%s | plant=%s | detect=%.3f | status=PENDING",
            normalized_id,
            request.request_id,
            resolved_plant_id,
            live.detection_score,
        )

        return RegisterResponse(
            request_id=request.request_id,
            employee_id=normalized_id,
            plant_id=resolved_plant_id,
            submitted_full_name=normalized_name,
            status=RegistrationStatus.PENDING,
            source=RegistrationSource.KIOSK,
            message=_REGISTER_SUCCESS_MESSAGE,
            submitted_at=request.captured_at.isoformat(),
        )

    def _extract_live_embedding(self, image_bytes: bytes):
        try:
            return self._face_verification.extract_live_embedding(image_bytes)
        except AuthError as exc:
            raise RegistrationError.from_auth_error(exc) from exc

    @staticmethod
    def _normalize_employee_id(employee_id: str) -> str:
        normalized = (employee_id or "").strip()
        if not normalized:
            raise RegistrationMissingEmployeeIdError()
        return normalized

    @staticmethod
    def _normalize_full_name(full_name: str) -> str:
        normalized = (full_name or "").strip()
        if not normalized:
            raise RegistrationMissingFullNameError()
        return normalized

    @staticmethod
    def _resolve_plant_id(plant_id: uuid.UUID | str) -> uuid.UUID:
        if plant_id is None or (isinstance(plant_id, str) and not plant_id.strip()):
            raise RegistrationMissingPlantIdError()
        if isinstance(plant_id, uuid.UUID):
            return plant_id
        try:
            return uuid.UUID(plant_id.strip())
        except ValueError as exc:
            raise RegistrationPlantNotFoundError(str(plant_id)) from exc

    @staticmethod
    def _validate_content_type(content_type: str | None) -> None:
        if not content_type:
            return
        normalized = content_type.split(";", 1)[0].strip().lower()
        if normalized not in _ACCEPTED_IMAGE_TYPES:
            raise RegistrationError(
                f"Unsupported image type: {content_type}",
                code=RegistrationErrorCode.UNSUPPORTED_IMAGE_TYPE,
                http_status=400,
                details={"content_type": content_type},
            )


def create_registration_service(
    *,
    face_verification: FaceVerificationService | None = None,
    duplicate_check: DuplicateCheckService | None = None,
    app_settings: Settings | None = None,
) -> RegistrationService:
    return RegistrationService(
        face_verification=face_verification or get_shared_face_verification_service(),
        duplicate_check=duplicate_check or get_shared_duplicate_check_service(),
        app_settings=app_settings,
    )


_shared_registration_service: RegistrationService | None = None


def get_shared_registration_service() -> RegistrationService:
    global _shared_registration_service
    if _shared_registration_service is None:
        _shared_registration_service = create_registration_service()
    return _shared_registration_service


__all__ = [
    "RegistrationService",
    "create_registration_service",
    "get_shared_registration_service",
]
