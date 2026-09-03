"""Admin Portal registration review — approve/reject plant-scoped queue.

Pending queue follows the **active plant workspace**:

  PLANT_ADMIN  — always ``session.plant_id`` (client plantId must match or be omitted)
  SUPER_ADMIN  — ``plant_id`` query = workspace lens for that plant;
                 omit ``plant_id`` only for legacy "all plants" listing

Workspace selection is a view filter. It never rewrites ``admin_roles.plant_id``.
Approve / reject / image still use ``assert_can_manage_plant`` on the request row.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from app.common.enums import AdminPermissionCode, AdminRoleType, AuditAction, RegistrationStatus
from app.common.exceptions import AdminError, AuthError, RegistrationError
from app.repositories import (
    audit_repository,
    employee_repository,
    enrollment_repository,
    plant_repository,
    raw_image_repository,
    registration_repository,
)
from app.schemas.admin import (
    AdminErrorCode,
    RegistrationDecisionResponse,
    RegistrationQueueItem,
    RegistrationQueueResponse,
)
from app.services.admin_auth import AdminSession
from app.services.admin_rbac import assert_can_manage_plant, assert_permission
from app.services.face_verification import (
    FaceVerificationService,
    get_shared_face_verification_service,
)
from app.services.duplicate_check import (
    DuplicateCheckService,
    get_shared_duplicate_check_service,
)

logger = logging.getLogger(__name__)


def _resolve_pending_workspace_plant_id(
    session: AdminSession,
    plant_id: uuid.UUID | None,
) -> uuid.UUID | None:
    """Resolve which plant's PENDING rows to list.

    Returns
    -------
    uuid.UUID
        Plant-scoped queue (normal path for both roles).
    None
        SUPER only — all plants (optional / transitional when no workspace set).
    """
    if session.role == AdminRoleType.SUPER_ADMIN.value:
        if plant_id is None:
            return None
        assert_can_manage_plant(session, plant_id)
        return plant_id

    if session.plant_id is None:
        raise AdminError(
            "Plant admin has no plant assignment.",
            code=AdminErrorCode.PLANT_ACCESS_DENIED,
            http_status=403,
        )
    if plant_id is not None and plant_id != session.plant_id:
        raise AdminError(
            "Plant admin cannot view another plant's queue.",
            code=AdminErrorCode.PLANT_ACCESS_DENIED,
            http_status=403,
        )
    return session.plant_id


class AdminReviewService:
    def __init__(
        self,
        *,
        face_verification: FaceVerificationService,
        duplicate_check: DuplicateCheckService,
    ) -> None:
        self._face_verification = face_verification
        self._duplicate_check = duplicate_check

    def list_pending(
        self,
        db: Session,
        session: AdminSession,
        *,
        plant_id: uuid.UUID | None = None,
    ) -> RegistrationQueueResponse:
        """List PENDING registrations for the active plant workspace.

        Parameters
        ----------
        plant_id:
            Active plant workspace from Admin Portal (SUPER selector).
            PLANT_ADMIN may omit; forced to ``session.plant_id``.
        """
        assert_permission(session, AdminPermissionCode.REGISTRATION_VIEW_PENDING)

        workspace_plant_id = _resolve_pending_workspace_plant_id(session, plant_id)

        if workspace_plant_id is None:
            rows = registration_repository.list_pending_all(db)
        else:
            plant = plant_repository.get_by_id(db, workspace_plant_id)
            if plant is None or not plant.is_active:
                raise AdminError(
                    "Plant workspace not found or inactive.",
                    code=AdminErrorCode.PLANT_ACCESS_DENIED,
                    http_status=404,
                )
            rows = registration_repository.list_pending_by_plant(db, workspace_plant_id)

        items: list[RegistrationQueueItem] = []
        for row in rows:
            plant = plant_repository.get_by_id(db, row.plant_id)
            items.append(
                RegistrationQueueItem(
                    request_id=row.request_id,
                    employee_id=row.employee_id,
                    submitted_full_name=row.submitted_full_name,
                    plant_id=row.plant_id,
                    plant_code=plant.plant_code if plant else None,
                    plant_name=plant.plant_name if plant else None,
                    status=RegistrationStatus(row.status),
                    source=row.source,
                    captured_at=row.captured_at.isoformat(),
                )
            )

        return RegistrationQueueResponse(items=items)

    def get_image_bytes(
        self,
        db: Session,
        session: AdminSession,
        request_id: uuid.UUID,
    ) -> bytes:
        assert_permission(session, AdminPermissionCode.REGISTRATION_VIEW_IMAGE)
        request = self._load_accessible_request(db, session, request_id)
        raw = raw_image_repository.get_by_request_id(db, request.request_id)
        if raw is None or not raw.image_data:
            raise AdminError(
                "Registration image not found.",
                code=AdminErrorCode.REQUEST_NOT_FOUND,
                http_status=404,
            )
        audit_repository.create_entry(
            db,
            action=AuditAction.VIEW_IMAGE.value,
            actor_id=session.employee_id,
            actor_role=session.role,
            target_type="registration_request",
            target_id=str(request.request_id),
            plant_id=request.plant_id,
        )
        db.commit()
        return raw.image_data

    def approve(
        self,
        db: Session,
        session: AdminSession,
        request_id: uuid.UUID,
        *,
        reason: str | None = None,
    ) -> RegistrationDecisionResponse:
        assert_permission(session, AdminPermissionCode.REGISTRATION_APPROVE)
        request = self._load_accessible_pending(db, session, request_id)
        raw = raw_image_repository.get_by_request_id(db, request.request_id)
        if raw is None or not raw.image_data:
            raise AdminError(
                "Registration image not found.",
                code=AdminErrorCode.REQUEST_NOT_FOUND,
                http_status=404,
            )

        try:
            live = self._face_verification.extract_live_embedding(raw.image_data)
        except AuthError as exc:
            raise RegistrationError.from_auth_error(exc) from exc

        self._duplicate_check.assert_no_duplicate_in_plant(
            db,
            plant_id=request.plant_id,
            employee_id=request.employee_id,
            live_embedding=live,
        )

        employee = employee_repository.get_by_id(db, request.employee_id)
        if employee is None:
            employee = employee_repository.create_active(
                db,
                employee_id=request.employee_id,
                plant_id=request.plant_id,
                full_name=request.submitted_full_name,
            )
        elif enrollment_repository.get_active_by_employee_id(db, request.employee_id) is not None:
            raise AdminError(
                "Employee already has an ACTIVE enrollment.",
                code=AdminErrorCode.REQUEST_NOT_PENDING,
                http_status=409,
            )

        enrollment_repository.create_active(
            db,
            employee_id=request.employee_id,
            plant_id=request.plant_id,
            embedding=list(live.vector),
            model_version=live.model_version,
            source_request_id=request.request_id,
        )

        registration_repository.mark_reviewed(
            db,
            request,
            status=RegistrationStatus.APPROVED,
            reviewed_by=session.employee_id,
            decision_reason=reason,
        )

        audit_repository.create_entry(
            db,
            action=AuditAction.APPROVE.value,
            actor_id=session.employee_id,
            actor_role=session.role,
            target_type="registration_request",
            target_id=str(request.request_id),
            plant_id=request.plant_id,
            metadata={
                "employee_id": request.employee_id,
                "submitted_full_name": request.submitted_full_name,
            },
        )

        db.commit()

        logger.info(
            "admin_approve | request=%s | employee=%s | reviewer=%s",
            request.request_id,
            request.employee_id,
            session.employee_id,
        )

        return RegistrationDecisionResponse(
            request_id=request.request_id,
            employee_id=request.employee_id,
            status=RegistrationStatus.APPROVED,
            message="Registration approved. Employee may now authenticate.",
        )

    def reject(
        self,
        db: Session,
        session: AdminSession,
        request_id: uuid.UUID,
        *,
        reason: str,
    ) -> RegistrationDecisionResponse:
        assert_permission(session, AdminPermissionCode.REGISTRATION_REJECT)
        normalized_reason = (reason or "").strip()
        if not normalized_reason:
            raise AdminError(
                "Rejection reason is required.",
                code=AdminErrorCode.MISSING_DECISION_REASON,
                http_status=400,
            )

        request = self._load_accessible_pending(db, session, request_id)

        registration_repository.mark_reviewed(
            db,
            request,
            status=RegistrationStatus.REJECTED,
            reviewed_by=session.employee_id,
            decision_reason=normalized_reason,
        )

        audit_repository.create_entry(
            db,
            action=AuditAction.REJECT.value,
            actor_id=session.employee_id,
            actor_role=session.role,
            target_type="registration_request",
            target_id=str(request.request_id),
            plant_id=request.plant_id,
            metadata={"reason": normalized_reason},
        )

        db.commit()

        return RegistrationDecisionResponse(
            request_id=request.request_id,
            employee_id=request.employee_id,
            status=RegistrationStatus.REJECTED,
            message="Registration rejected.",
        )

    def _load_accessible_request(
        self,
        db: Session,
        session: AdminSession,
        request_id: uuid.UUID,
    ):
        request = registration_repository.get_by_id(db, request_id)
        if request is None:
            raise AdminError(
                "Registration request not found.",
                code=AdminErrorCode.REQUEST_NOT_FOUND,
                http_status=404,
            )
        assert_can_manage_plant(session, request.plant_id)
        return request

    def _load_accessible_pending(
        self,
        db: Session,
        session: AdminSession,
        request_id: uuid.UUID,
    ):
        request = self._load_accessible_request(db, session, request_id)
        if request.status != RegistrationStatus.PENDING.value:
            raise AdminError(
                "Registration request is not PENDING.",
                code=AdminErrorCode.REQUEST_NOT_PENDING,
                http_status=409,
            )
        return request


def get_shared_admin_review_service() -> AdminReviewService:
    return AdminReviewService(
        face_verification=get_shared_face_verification_service(),
        duplicate_check=get_shared_duplicate_check_service(),
    )


__all__ = ["AdminReviewService", "get_shared_admin_review_service"]
