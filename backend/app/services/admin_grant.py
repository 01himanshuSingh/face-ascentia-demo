"""Grant admin roles to enrolled employees (worker-first provisioning).

Plant for PLANT_ADMIN is always derived from ``employees.plant_id`` — granters
cannot assign a worker to a different plant at grant time. SUPER may grant
across plants by choosing any enrolled employee; PLANT_ADMIN only employees
in ``session.plant_id`` (enforced via admin_rbac).
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from app.common.enums import AdminPermissionCode, AdminRoleType, AuditAction
from app.common.exceptions import AdminError
from app.database.models.admin_role import AdminRole
from app.database.models.employee import Employee
from app.repositories import admin_role_repository, audit_repository, employee_repository
from app.schemas.admin import AdminErrorCode, AdminGrantPreviewResponse, AdminGrantResponse
from app.services.admin_auth import AdminAuthService, AdminSession
from app.services.admin_rbac import (
    assert_can_grant_role,
    assert_can_manage_plant,
    assert_permission,
    assign_default_permissions,
)

logger = logging.getLogger(__name__)


def _resolve_grant_plant_id(
    employee: Employee,
    requested_plant_id: uuid.UUID | None,
) -> uuid.UUID:
    """Authoritative plant for admin_roles.plant_id — always the employee workspace."""
    effective = employee.plant_id
    if requested_plant_id is not None and requested_plant_id != effective:
        raise AdminError(
            "plantId must match the employee's plant. Omit plantId — "
            "it is derived from the employee record.",
            code=AdminErrorCode.PLANT_ACCESS_DENIED,
            http_status=409,
        )
    return effective


class AdminGrantService:
    def preview_grant_target(
        self,
        db: Session,
        session: AdminSession,
        *,
        employee_id: str,
    ) -> AdminGrantPreviewResponse:
        normalized_id = (employee_id or "").strip()
        if not normalized_id:
            raise AdminError(
                "employee_id is required.",
                code=AdminErrorCode.INVALID_CREDENTIALS,
                http_status=400,
            )

        assert_permission(session, AdminPermissionCode.ADMIN_GRANT_PLANT_ADMIN)

        employee = employee_repository.get_by_id_with_plant(db, normalized_id)
        if employee is None:
            raise AdminError(
                f"Employee '{normalized_id}' not found. Enroll as worker first.",
                code=AdminErrorCode.EMPLOYEE_NOT_FOUND,
                http_status=404,
            )

        assert_can_manage_plant(session, employee.plant_id)

        plant = employee.plant
        return AdminGrantPreviewResponse(
            employee_id=employee.employee_id,
            full_name=employee.full_name,
            plant_id=employee.plant_id,
            plant_code=plant.plant_code,
            plant_name=plant.plant_name,
            grant_eligible=True,
        )

    def grant_role(
        self,
        db: Session,
        session: AdminSession,
        *,
        employee_id: str,
        role: AdminRoleType,
        plant_id: uuid.UUID | None,
        password: str,
    ) -> AdminGrantResponse:
        normalized_id = (employee_id or "").strip()
        if not normalized_id or not password:
            raise AdminError(
                "employee_id and password are required.",
                code=AdminErrorCode.INVALID_CREDENTIALS,
                http_status=400,
            )

        if role == AdminRoleType.SUB_ADMIN:
            raise AdminError(
                "SUB_ADMIN is not enabled in v1.",
                code=AdminErrorCode.PERMISSION_DENIED,
                http_status=403,
            )

        employee = employee_repository.get_by_id(db, normalized_id)
        if employee is None:
            raise AdminError(
                f"Employee '{normalized_id}' not found. Enroll as worker first.",
                code=AdminErrorCode.EMPLOYEE_NOT_FOUND,
                http_status=404,
            )

        if role == AdminRoleType.PLANT_ADMIN:
            effective_plant_id = _resolve_grant_plant_id(employee, plant_id)
        else:
            effective_plant_id = plant_id

        assert_can_grant_role(
            session,
            target_role=role,
            target_plant_id=effective_plant_id,
        )

        existing = admin_role_repository.get_by_employee_id(db, normalized_id)
        password_hash = AdminAuthService.hash_password(password)

        if existing is None:
            admin_row = AdminRole(
                employee_id=normalized_id,
                plant_id=effective_plant_id,
                role=role.value,
                password_hash=password_hash,
                is_active=True,
                granted_by=session.employee_id,
            )
            db.add(admin_row)
            db.flush()
            db.refresh(admin_row)
            assign_default_permissions(db, role_id=admin_row.role_id, role=role)
        else:
            admin_row = existing
            admin_row.plant_id = effective_plant_id
            admin_row.role = role.value
            admin_row.password_hash = password_hash
            admin_row.is_active = True
            admin_row.granted_by = session.employee_id
            admin_role_repository.clear_permissions(db, admin_row.role_id)
            assign_default_permissions(db, role_id=admin_row.role_id, role=role)

        audit_repository.create_entry(
            db,
            action=AuditAction.ADMIN_GRANT.value,
            actor_id=session.employee_id,
            actor_role=session.role,
            target_type="admin_role",
            target_id=normalized_id,
            plant_id=effective_plant_id,
            metadata={"granted_role": role.value},
        )

        db.commit()

        logger.info(
            "admin_grant | target=%s | role=%s | plant=%s | granter=%s",
            normalized_id,
            role.value,
            effective_plant_id,
            session.employee_id,
        )

        return AdminGrantResponse(
            employee_id=normalized_id,
            role=role.value,
            plant_id=effective_plant_id,
            message=f"Admin role {role.value} granted.",
        )


def get_shared_admin_grant_service() -> AdminGrantService:
    return AdminGrantService()


__all__ = ["AdminGrantService", "get_shared_admin_grant_service"]
