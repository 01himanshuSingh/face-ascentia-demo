"""Employee lifecycle for Admin Portal — list Active/Left + soft revoke.

System boundary
---------------
  GET  status=active  → ACTIVE workers with ACTIVE enrollment
  GET  status=inactive → INACTIVE workers (left; employee_id kept)
  POST revoke → employees.INACTIVE + enrollments.REVOKED + auto-ungrant

Does NOT hard-delete employee_id. Does NOT touch registration_requests history.
Self-register / auth stay blocked while INACTIVE (existing services).

Strict v1: revoked workers cannot self-enroll until an admin restores them
(reactivate flow deferred).
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from app.common.enums import AdminPermissionCode, AuditAction, EmployeeStatus
from app.common.exceptions import AdminError
from app.repositories import (
    audit_repository,
    employee_repository,
    enrollment_repository,
    plant_repository,
)
from app.schemas.admin import AdminErrorCode
from app.schemas.employees import (
    AdminEmployeeItem,
    AdminEmployeeListResponse,
    EmployeeListStatus,
    EmployeeRevokeResponse,
)
from app.services.admin_auth import AdminSession, get_shared_admin_auth_service
from app.services.admin_rbac import assert_can_manage_plant, assert_permission
from app.services.admin_users import get_shared_admin_users_service

logger = logging.getLogger(__name__)


def _require_plant(db: Session, plant_id: uuid.UUID) -> None:
    plant = plant_repository.get_by_id(db, plant_id)
    if plant is None:
        raise AdminError(
            "Plant not found.",
            code=AdminErrorCode.PLANT_NOT_FOUND,
            http_status=404,
        )


class EmployeeLifecycleService:
    """Plant-scoped worker roster and soft revoke."""

    def list_employees(
        self,
        db: Session,
        session: AdminSession,
        *,
        plant_id: uuid.UUID,
        status: EmployeeListStatus = "active",
        q: str | None = None,
        limit: int = 15,
        offset: int = 0,
    ) -> AdminEmployeeListResponse:
        assert_permission(session, AdminPermissionCode.EMPLOYEE_REVOKE)
        assert_can_manage_plant(session, plant_id)
        _require_plant(db, plant_id)

        safe_limit = max(1, min(limit, 200))
        safe_offset = max(0, offset)

        if status == "inactive":
            rows = employee_repository.list_inactive_by_plant(
                db,
                plant_id,
                q=q,
                limit=safe_limit,
                offset=safe_offset,
            )
            total = employee_repository.count_inactive_by_plant(
                db,
                plant_id,
                q=q,
            )
            items = [
                AdminEmployeeItem(
                    employee_id=row.employee.employee_id,
                    full_name=row.employee.full_name,
                    plant_id=row.employee.plant_id,
                    status=row.employee.status,
                    enrolled_at=row.enrolled_at,
                    enrollment_id=row.enrollment_id,
                    revoked_reason=row.revoked_reason,
                    left_at=row.left_at,
                )
                for row in rows
            ]
        else:
            active_rows = employee_repository.list_active_enrolled_by_plant(
                db,
                plant_id,
                q=q,
                limit=safe_limit,
                offset=safe_offset,
            )
            total = employee_repository.count_active_enrolled_by_plant(
                db,
                plant_id,
                q=q,
            )
            items = [
                AdminEmployeeItem(
                    employee_id=employee.employee_id,
                    full_name=employee.full_name,
                    plant_id=employee.plant_id,
                    status=employee.status,
                    enrolled_at=enrollment.created_at,
                    enrollment_id=enrollment.enrollment_id,
                )
                for employee, enrollment in active_rows
            ]

        return AdminEmployeeListResponse(
            items=items,
            total=total,
            plant_id=plant_id,
            status=status,
            limit=safe_limit,
            offset=safe_offset,
        )

    def revoke_employee(
        self,
        db: Session,
        session: AdminSession,
        *,
        employee_id: str,
        plant_id: uuid.UUID,
        reason: str,
    ) -> EmployeeRevokeResponse:
        """Soft-revoke enrolled worker in workspace (strict — no self-enroll)."""
        assert_permission(session, AdminPermissionCode.EMPLOYEE_REVOKE)
        assert_can_manage_plant(session, plant_id)
        _require_plant(db, plant_id)

        normalized_id = (employee_id or "").strip()
        normalized_reason = (reason or "").strip()
        if not normalized_id:
            raise AdminError(
                "employee_id is required.",
                code=AdminErrorCode.EMPLOYEE_NOT_FOUND,
                http_status=400,
            )
        if not normalized_reason:
            raise AdminError(
                "Revoke reason is required.",
                code=AdminErrorCode.MISSING_DECISION_REASON,
                http_status=400,
            )

        if normalized_id == session.employee_id:
            raise AdminError(
                "Cannot revoke your own employee record.",
                code=AdminErrorCode.PERMISSION_DENIED,
                http_status=403,
            )

        employee = employee_repository.get_by_id(db, normalized_id)
        if employee is None:
            raise AdminError(
                f"Employee '{normalized_id}' not found.",
                code=AdminErrorCode.EMPLOYEE_NOT_FOUND,
                http_status=404,
            )
        if employee.plant_id != plant_id:
            raise AdminError(
                "Employee is not in this plant workspace.",
                code=AdminErrorCode.PLANT_ACCESS_DENIED,
                http_status=403,
            )
        if employee.status != EmployeeStatus.ACTIVE.value:
            raise AdminError(
                f"Employee '{normalized_id}' is already inactive.",
                code=AdminErrorCode.EMPLOYEE_ALREADY_INACTIVE,
                http_status=409,
            )

        try:
            revoked_enrollment = enrollment_repository.revoke_active_for_employee(
                db,
                normalized_id,
                revoked_by=session.employee_id,
                reason=normalized_reason,
            )
            employee_repository.set_inactive(db, employee)

            ungrant_results = get_shared_admin_users_service().auto_ungrant_for_employee(
                db,
                employee_id=normalized_id,
                reason=normalized_reason,
                actor_id=session.employee_id,
                actor_role=session.role,
                commit=False,
            )

            audit_repository.create_entry(
                db,
                action=AuditAction.EMPLOYEE_REVOKE.value,
                actor_id=session.employee_id,
                actor_role=session.role,
                target_type="employee",
                target_id=normalized_id,
                plant_id=plant_id,
                metadata={
                    "employee_id": normalized_id,
                    "full_name": employee.full_name,
                    "reason": normalized_reason,
                    "enrollment_revoked": revoked_enrollment is not None,
                    "enrollment_id": str(revoked_enrollment.enrollment_id)
                    if revoked_enrollment
                    else None,
                    "admin_ungranted": len(ungrant_results) > 0,
                    "admin_roles_ungranted": len(ungrant_results),
                },
            )

            db.commit()
        except AdminError:
            db.rollback()
            raise
        except Exception:
            db.rollback()
            logger.exception(
                "employee_revoke_failed | employee=%s | actor=%s",
                normalized_id,
                session.employee_id,
            )
            raise

        get_shared_admin_auth_service().invalidate_sessions_for_employee(
            normalized_id
        )

        logger.info(
            "employee_revoke | employee=%s | plant=%s | actor=%s | enrollment=%s | admin_ungranted=%s",
            normalized_id,
            plant_id,
            session.employee_id,
            revoked_enrollment is not None,
            len(ungrant_results) > 0,
        )

        return EmployeeRevokeResponse(
            employee_id=normalized_id,
            plant_id=plant_id,
            enrollment_revoked=revoked_enrollment is not None,
            admin_ungranted=len(ungrant_results) > 0,
            message=(
                f"Employee '{normalized_id}' revoked. Face login disabled."
            ),
        )


def get_shared_employee_lifecycle_service() -> EmployeeLifecycleService:
    return EmployeeLifecycleService()


__all__ = ["EmployeeLifecycleService", "get_shared_employee_lifecycle_service"]
