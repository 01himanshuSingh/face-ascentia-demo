"""Grant admin roles to enrolled employees (worker-first provisioning)."""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from app.common.enums import AdminRoleType, AuditAction
from app.common.exceptions import AdminError
from app.database.models.admin_role import AdminRole
from app.repositories import admin_role_repository, audit_repository, employee_repository
from app.schemas.admin import AdminErrorCode, AdminGrantResponse
from app.services.admin_auth import AdminAuthService, AdminSession
from app.services.admin_rbac import (
    assert_can_grant_role,
    assert_target_employee_exists,
    assign_default_permissions,
)

logger = logging.getLogger(__name__)


class AdminGrantService:
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

        if role == AdminRoleType.PLANT_ADMIN and plant_id is None:
            raise AdminError(
                "plant_id is required for PLANT_ADMIN.",
                code=AdminErrorCode.PLANT_ACCESS_DENIED,
                http_status=400,
            )

        if role == AdminRoleType.SUB_ADMIN:
            raise AdminError(
                "SUB_ADMIN is not enabled in v1.",
                code=AdminErrorCode.PERMISSION_DENIED,
                http_status=403,
            )

        assert_can_grant_role(
            session,
            target_role=role,
            target_plant_id=plant_id,
        )
        assert_target_employee_exists(db, normalized_id)

        employee = employee_repository.get_by_id(db, normalized_id)
        assert employee is not None

        if role == AdminRoleType.PLANT_ADMIN:
            if employee.plant_id != plant_id:
                raise AdminError(
                    f"Employee '{normalized_id}' belongs to a different plant.",
                    code=AdminErrorCode.PLANT_ACCESS_DENIED,
                    http_status=409,
                )

        existing = admin_role_repository.get_by_employee_id(db, normalized_id)
        password_hash = AdminAuthService.hash_password(password)

        if existing is None:
            admin_row = AdminRole(
                employee_id=normalized_id,
                plant_id=plant_id,
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
            admin_row.plant_id = plant_id
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
            plant_id=plant_id or employee.plant_id,
            metadata={"granted_role": role.value},
        )

        db.commit()

        logger.info(
            "admin_grant | target=%s | role=%s | granter=%s",
            normalized_id,
            role.value,
            session.employee_id,
        )

        return AdminGrantResponse(
            employee_id=normalized_id,
            role=role.value,
            plant_id=plant_id,
            message=f"Admin role {role.value} granted.",
        )


def get_shared_admin_grant_service() -> AdminGrantService:
    return AdminGrantService()


__all__ = ["AdminGrantService", "get_shared_admin_grant_service"]
