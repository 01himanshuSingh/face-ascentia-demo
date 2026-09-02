"""
Kiosk admin service (Path B — plant admin enrolls workers at kiosk).

System design
-------------
Coordinates POST /kiosk/admin-login, /kiosk/admin-enroll, /kiosk/admin-logout.

  KioskAdminService (this module)
        ↓
  AdminAuthService          — shared credential + session store
  FaceVerificationService   — detect + SFace embed on fresh capture
  DuplicateCheckService     — plant-scoped 1:N guard
  registration_repository   — ADMIN_KIOSK APPROVED provenance row
  employee_repository       — create ACTIVE worker when missing
  enrollment_repository     — ACTIVE enrollment at capture time
  audit_repository          — ADMIN_KIOSK_ENROLL per worker

Non-goals (explicit boundaries)
-------------------------------
- Does NOT grant admin_roles (see admin_grant.py / POST /admin/users/grant).
- Does NOT approve PENDING Path A requests (see admin_review.py).
- Does NOT accept plant_id from the client on enroll — session.plant_id only.

v1 operator policy
------------------
PLANT_ADMIN with non-null plant_id only. SUPER_ADMIN is blocked until a plant
context mechanism exists (KIOSK_PLANT_REQUIRED).

Adaptability
------------
- Constructor injection for auth, face, duplicate_check (tests + future Redis).
- Shared factory get_shared_kiosk_admin_service() matches other services.
- Enroll core (_enroll_worker_at_plant) isolated from HTTP/session concerns.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from app.common.enums import (
    AdminPermissionCode,
    AdminRoleType,
    AuditAction,
    EmployeeStatus,
    EnrollmentStatus,
    RegistrationSource,
    RegistrationStatus,
)
from app.common.exceptions import (
    AdminError,
    AlreadyEnrolledError,
    AuthError,
    KioskAdminError,
    PendingRegistrationExistsError,
    RegistrationEmployeeInactiveError,
    RegistrationError,
    RegistrationPlantMismatchError,
)
from app.core.config import Settings, get_settings, settings
from app.repositories import (
    audit_repository,
    employee_repository,
    enrollment_repository,
    plant_repository,
    raw_image_repository,
    registration_repository,
)
from app.schemas.kiosk_admin import (
    KioskAdminEnrollFormFields,
    KioskAdminEnrollResponse,
    KioskAdminErrorCode,
    KioskAdminLoginResponse,
    KioskAdminLogoutResponse,
)
from app.services.admin_auth import AdminAuthService, AdminSession, get_shared_admin_auth_service
from app.services.admin_rbac import assert_permission
from app.services.duplicate_check import (
    DuplicateCheckService,
    get_shared_duplicate_check_service,
)
from app.services.face_verification import (
    FaceVerificationService,
    get_shared_face_verification_service,
)

logger = logging.getLogger(__name__)

_ACCEPTED_IMAGE_TYPES = KioskAdminEnrollFormFields().accepted_image_types

_ENROLL_SUCCESS_MESSAGE = (
    "Employee enrolled successfully. They may authenticate with face login now."
)

class KioskAdminService:
    """
    Path B business logic — admin operator enrolls target workers at kiosk.

    Login/logout delegate to AdminAuthService (one credential system).
    """

    def __init__(
        self,
        *,
        auth: AdminAuthService,
        face_verification: FaceVerificationService,
        duplicate_check: DuplicateCheckService,
        app_settings: Settings | None = None,
    ) -> None:
        self._auth = auth
        self._face_verification = face_verification
        self._duplicate_check = duplicate_check
        self._settings = app_settings or settings

    # -------------------------------------------------------------------------
    # Public API (called by kiosk_admin routes)
    # -------------------------------------------------------------------------

    def login(
        self,
        db: Session,
        *,
        employee_id: str,
        password: str,
    ) -> KioskAdminLoginResponse:
        """
        Authenticate admin operator at kiosk.

        employee_id is the admin's ID (admin_roles), not the worker being enrolled.
        """
        try:
            portal_response = self._auth.login(
                db,
                employee_id=employee_id,
                password=password,
            )
        except AdminError as exc:
            raise KioskAdminError.from_admin_error(exc) from exc

        plant_code: str | None = None
        plant_name: str | None = None
        if portal_response.plant_id is not None:
            plant = plant_repository.get_by_id(db, portal_response.plant_id)
            if plant is not None:
                plant_code = plant.plant_code
                plant_name = plant.plant_name

        logger.info(
            "kiosk_admin_login | admin=%s | role=%s | plant=%s",
            portal_response.employee_id,
            portal_response.role,
            portal_response.plant_id,
        )

        return KioskAdminLoginResponse(
            admin_session_token=portal_response.admin_session_token,
            employee_id=portal_response.employee_id,
            role=portal_response.role,
            plant_id=portal_response.plant_id,
            plant_code=plant_code,
            plant_name=plant_name,
            expires_at=portal_response.expires_at,
        )

    def logout(self, token: str | None) -> KioskAdminLogoutResponse:
        """Invalidate admin kiosk session. Idempotent if token already gone."""
        normalized = (token or "").strip()
        if normalized:
            try:
                session = self._auth.resolve_session(normalized)
                logger.info(
                    "kiosk_admin_logout | admin=%s | plant=%s",
                    session.employee_id,
                    session.plant_id,
                )
            except AdminError:
                pass
            self._auth.invalidate_session(normalized)

        return KioskAdminLogoutResponse(
            success=True,
            message="Admin kiosk session ended.",
        )

    def enroll_employee(
        self,
        db: Session,
        session: AdminSession,
        *,
        employee_id: str,
        full_name: str,
        image_bytes: bytes,
        content_type: str | None = None,
        kiosk_id: str | None = None,
        session_id: str | None = None,
    ) -> KioskAdminEnrollResponse:
        """
        Enroll one target worker — ACTIVE immediately (no Admin Portal queue).

        plant_id is always taken from the admin session, never from arguments.
        """
        plant_id = self._resolve_enroll_plant(session)
        assert_permission(session, AdminPermissionCode.REGISTRATION_APPROVE)

        normalized_id = self._normalize_target_employee_id(employee_id)
        submitted_name = self._normalize_full_name(full_name)
        self._validate_image_payload(image_bytes, content_type)
        self._assert_worker_eligible(
            db,
            employee_id=normalized_id,
            plant_id=plant_id,
        )

        live = self._extract_live_embedding(image_bytes)

        self._duplicate_check.assert_no_duplicate_in_plant(
            db,
            plant_id=plant_id,
            employee_id=normalized_id,
            live_embedding=live,
        )

        try:
            request = registration_repository.create_admin_kiosk_approved(
                db,
                employee_id=normalized_id,
                plant_id=plant_id,
                submitted_full_name=submitted_name,
                reviewed_by=session.employee_id,
                kiosk_id=kiosk_id,
                session_id=session_id,
            )
            raw_image_repository.create_for_request(
                db,
                request_id=request.request_id,
                image_data=image_bytes,
            )

            employee = employee_repository.get_by_id(db, normalized_id)
            if employee is None:
                employee_repository.create_active(
                    db,
                    employee_id=normalized_id,
                    plant_id=plant_id,
                    full_name=submitted_name,
                )
            else:
                employee.full_name = submitted_name

            enrollment_repository.create_active(
                db,
                employee_id=normalized_id,
                plant_id=plant_id,
                embedding=list(live.vector),
                model_version=live.model_version,
                source_request_id=request.request_id,
            )

            audit_repository.create_entry(
                db,
                action=AuditAction.ADMIN_KIOSK_ENROLL.value,
                actor_id=session.employee_id,
                actor_role=session.role,
                target_type="registration_request",
                target_id=str(request.request_id),
                plant_id=plant_id,
                metadata={
                    "employee_id": normalized_id,
                    "admin_operator": session.employee_id,
                    "source": RegistrationSource.ADMIN_KIOSK.value,
                },
            )

            db.commit()
            db.refresh(request)
        except Exception:
            db.rollback()
            raise

        logger.info(
            "kiosk_admin_enroll | admin=%s | employee=%s | plant=%s | request=%s | detect=%.3f",
            session.employee_id,
            normalized_id,
            plant_id,
            request.request_id,
            live.detection_score,
        )

        return KioskAdminEnrollResponse(
            success=True,
            request_id=request.request_id,
            employee_id=normalized_id,
            plant_id=plant_id,
            enrollment_status=EnrollmentStatus.ACTIVE,
            registration_status=RegistrationStatus.APPROVED,
            source=RegistrationSource.ADMIN_KIOSK,
            message=_ENROLL_SUCCESS_MESSAGE,
        )

    # -------------------------------------------------------------------------
    # Session / plant policy (v1)
    # -------------------------------------------------------------------------

    @staticmethod
    def _resolve_enroll_plant(session: AdminSession) -> uuid.UUID:
        """
        v1: PLANT_ADMIN with assigned plant only.

        SUPER_ADMIN (plant_id=NULL) cannot enroll at kiosk until plant picker exists.
        """
        if session.role == AdminRoleType.SUPER_ADMIN.value:
            raise KioskAdminError(
                "Super admin kiosk enroll requires plant context (not enabled in v1).",
                code=KioskAdminErrorCode.KIOSK_PLANT_REQUIRED,
                http_status=403,
            )

        if session.role != AdminRoleType.PLANT_ADMIN.value:
            raise KioskAdminError(
                "Only plant admins may enroll employees at the kiosk.",
                code=KioskAdminErrorCode.PERMISSION_DENIED,
                http_status=403,
            )

        if session.plant_id is None:
            raise KioskAdminError(
                "Plant admin has no plant assignment for kiosk enroll.",
                code=KioskAdminErrorCode.KIOSK_PLANT_REQUIRED,
                http_status=403,
            )

        return session.plant_id

    # -------------------------------------------------------------------------
    # Worker eligibility + validation
    # -------------------------------------------------------------------------

    @staticmethod
    def _normalize_target_employee_id(employee_id: str) -> str:
        normalized = (employee_id or "").strip()
        if not normalized:
            raise KioskAdminError(
                "employee_id is required.",
                code=KioskAdminErrorCode.MISSING_EMPLOYEE_ID,
                http_status=400,
            )
        return normalized

    @staticmethod
    def _normalize_full_name(full_name: str) -> str:
        normalized = (full_name or "").strip()
        if not normalized:
            raise KioskAdminError(
                "full_name is required.",
                code=KioskAdminErrorCode.MISSING_FULL_NAME,
                http_status=400,
            )
        return normalized

    def _assert_worker_eligible(
        self,
        db: Session,
        *,
        employee_id: str,
        plant_id: uuid.UUID,
    ) -> None:
        """
        Guard before face pipeline — mirrors Path A guards where applicable.

        Does not require a pre-existing employees row (registration-first).
        """
        try:
            if (
                registration_repository.get_pending_by_employee_id(db, employee_id)
                is not None
            ):
                raise PendingRegistrationExistsError(employee_id)

            employee = employee_repository.get_by_id(db, employee_id)
            if employee is None:
                return

            if employee.status != EmployeeStatus.ACTIVE.value:
                raise RegistrationEmployeeInactiveError(employee_id)

            if employee.plant_id != plant_id:
                raise RegistrationPlantMismatchError(
                    employee_id=employee_id,
                    expected_plant_id=str(employee.plant_id),
                )

            if enrollment_repository.get_active_by_employee_id(db, employee_id) is not None:
                raise AlreadyEnrolledError(employee_id)
        except RegistrationError as exc:
            raise KioskAdminError.from_registration_error(exc) from exc

    def _extract_live_embedding(self, image_bytes: bytes):
        if not image_bytes:
            raise KioskAdminError(
                "Image is empty.",
                code=KioskAdminErrorCode.EMPTY_IMAGE,
                http_status=400,
            )
        max_bytes = self._settings.auth_max_image_bytes
        if len(image_bytes) > max_bytes:
            raise KioskAdminError(
                f"Image exceeds maximum size of {max_bytes} bytes.",
                code=KioskAdminErrorCode.IMAGE_TOO_LARGE,
                http_status=400,
            )
        try:
            return self._face_verification.extract_live_embedding(image_bytes)
        except AuthError as exc:
            raise KioskAdminError.from_auth_error(exc) from exc

    @staticmethod
    def _validate_image_payload(
        image_bytes: bytes,
        content_type: str | None,
    ) -> None:
        if not image_bytes:
            raise KioskAdminError(
                "Image is empty.",
                code=KioskAdminErrorCode.EMPTY_IMAGE,
                http_status=400,
            )
        if not content_type:
            return
        normalized = content_type.split(";", 1)[0].strip().lower()
        if normalized not in _ACCEPTED_IMAGE_TYPES:
            raise KioskAdminError(
                f"Unsupported image type: {content_type}",
                code=KioskAdminErrorCode.UNSUPPORTED_IMAGE_TYPE,
                http_status=400,
            )


def create_kiosk_admin_service(
    *,
    auth: AdminAuthService | None = None,
    face_verification: FaceVerificationService | None = None,
    duplicate_check: DuplicateCheckService | None = None,
    app_settings: Settings | None = None,
) -> KioskAdminService:
    return KioskAdminService(
        auth=auth or get_shared_admin_auth_service(),
        face_verification=face_verification or get_shared_face_verification_service(),
        duplicate_check=duplicate_check or get_shared_duplicate_check_service(),
        app_settings=app_settings or get_settings(),
    )


_shared_kiosk_admin_service: KioskAdminService | None = None


def get_shared_kiosk_admin_service() -> KioskAdminService:
    global _shared_kiosk_admin_service
    if _shared_kiosk_admin_service is None:
        _shared_kiosk_admin_service = create_kiosk_admin_service()
    return _shared_kiosk_admin_service


__all__ = [
    "KioskAdminService",
    "create_kiosk_admin_service",
    "get_shared_kiosk_admin_service",
]
