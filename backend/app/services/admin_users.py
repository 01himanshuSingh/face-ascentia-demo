"""Plant admin roster, revoke, and auto-ungrant.

System boundary
---------------
Owns **admin lifecycle after grant** for Admin Portal:

  GET  list/search active plant-scoped admins in a workspace
  POST revoke (ungrant) → admin_roles.is_active=false
  auto_ungrant_for_employee — when worker leaves plant / becomes INACTIVE

Does NOT grant roles (``admin_grant``), rewrite employee plant, or touch
enrollments / face login.

Policy (``admin_rbac``)
----------------------
  v1: only global sessions (SUPER) list/revoke PLANT_ADMIN in ``plantId``.
  Plant admins cannot ungrant peers.
  Future: widen revocable matrix so plant admins may ungrant SUB_ADMIN.

Auto-ungrant is a domain hook (no interactive session required) — still
writes audit REVOKE per deactivated row.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from app.common.enums import AdminRoleType, AuditAction
from app.common.exceptions import AdminError
from app.database.models.admin_role import AdminRole
from app.repositories import admin_role_repository, audit_repository, plant_repository
from app.schemas.admin import (
    AdminErrorCode,
    AdminRevokeResponse,
    AdminUserItem,
    AdminUserListResponse,
)
from app.services.admin_auth import AdminSession, get_shared_admin_auth_service
from app.services.admin_rbac import (
    assert_can_list_plant_admins,
    assert_can_revoke_admin,
    revocable_roles_for_session,
)

logger = logging.getLogger(__name__)


def _require_plant(db: Session, plant_id: uuid.UUID) -> None:
    if plant_repository.get_by_id(db, plant_id) is None:
        raise AdminError(
            f"Plant '{plant_id}' was not found.",
            code=AdminErrorCode.PLANT_NOT_FOUND,
            http_status=404,
        )


def _to_user_item(admin: AdminRole) -> AdminUserItem:
    if admin.plant_id is None:
        raise AdminError(
            "Cannot list global SUPER rows in a plant admin roster.",
            code=AdminErrorCode.PERMISSION_DENIED,
            http_status=500,
        )
    employee = admin.employee
    full_name = employee.full_name if employee is not None else admin.employee_id
    return AdminUserItem(
        employee_id=admin.employee_id,
        full_name=full_name,
        role=admin.role,
        plant_id=admin.plant_id,
        granted_by=admin.granted_by,
        created_at=admin.created_at.isoformat(),
    )


def _audit_revoke(
    db: Session,
    *,
    admin: AdminRole,
    actor_id: str | None,
    actor_role: str | None,
    reason: str | None,
    source: str,
) -> None:
    if admin.plant_id is None:
        return
    metadata: dict[str, str] = {
        "revoked_role": admin.role,
        "source": source,
    }
    if reason and reason.strip():
        metadata["reason"] = reason.strip()

    audit_repository.create_entry(
        db,
        action=AuditAction.REVOKE.value,
        actor_id=actor_id,
        actor_role=actor_role,
        target_type="admin_role",
        target_id=admin.employee_id,
        plant_id=admin.plant_id,
        metadata=metadata,
    )


class AdminUsersService:
    """List / revoke plant-scoped admins; auto-ungrant on employee leave."""

    def list_plant_admins(
        self,
        db: Session,
        session: AdminSession,
        *,
        plant_id: uuid.UUID,
        q: str | None = None,
        limit: int = 15,
        offset: int = 0,
    ) -> AdminUserListResponse:
        """Active admins for one plant workspace (search + pagination)."""
        assert_can_list_plant_admins(session, plant_id=plant_id)
        _require_plant(db, plant_id)

        role_values = frozenset(
            role.value for role in revocable_roles_for_session(session)
        )
        safe_limit = max(1, min(limit, 200))
        safe_offset = max(0, offset)
        items = admin_role_repository.list_active_by_plant(
            db,
            plant_id,
            q=q,
            roles=role_values,
            limit=safe_limit,
            offset=safe_offset,
        )
        total = admin_role_repository.count_active_by_plant(
            db,
            plant_id,
            q=q,
            roles=role_values,
        )
        return AdminUserListResponse(
            items=[_to_user_item(row) for row in items],
            total=total,
            plant_id=plant_id,
            limit=safe_limit,
            offset=safe_offset,
        )

    def revoke_plant_admin(
        self,
        db: Session,
        session: AdminSession,
        *,
        employee_id: str,
        plant_id: uuid.UUID,
        reason: str | None = None,
    ) -> AdminRevokeResponse:
        """Soft-ungrant PLANT_ADMIN (v1) in the given workspace.

        Employee + enrollments unchanged — person remains a normal worker.
        """
        normalized_id = (employee_id or "").strip()
        if not normalized_id:
            raise AdminError(
                "employee_id is required.",
                code=AdminErrorCode.EMPLOYEE_NOT_FOUND,
                http_status=400,
            )

        _require_plant(db, plant_id)

        admin = admin_role_repository.get_active_by_employee_and_plant(
            db,
            normalized_id,
            plant_id,
        )
        if admin is None:
            raise AdminError(
                f"No active plant admin '{normalized_id}' in this workspace.",
                code=AdminErrorCode.ADMIN_NOT_FOUND,
                http_status=404,
            )

        try:
            target_role = AdminRoleType(admin.role)
        except ValueError as exc:
            raise AdminError(
                f"Cannot revoke unsupported role '{admin.role}'.",
                code=AdminErrorCode.PERMISSION_DENIED,
                http_status=403,
            ) from exc

        assert_can_revoke_admin(
            session,
            target_role=target_role,
            target_plant_id=admin.plant_id,
        )

        if normalized_id == session.employee_id:
            raise AdminError(
                "Cannot revoke your own admin role.",
                code=AdminErrorCode.PERMISSION_DENIED,
                http_status=403,
            )

        admin_role_repository.deactivate(db, admin)
        _audit_revoke(
            db,
            admin=admin,
            actor_id=session.employee_id,
            actor_role=session.role,
            reason=reason,
            source="ADMIN_PORTAL",
        )
        db.commit()

        dropped = get_shared_admin_auth_service().invalidate_sessions_for_employee(
            normalized_id
        )

        logger.info(
            "admin_revoke | target=%s | role=%s | plant=%s | actor=%s | sessions_dropped=%s",
            normalized_id,
            admin.role,
            plant_id,
            session.employee_id,
            dropped,
        )
        return AdminRevokeResponse(
            employee_id=normalized_id,
            role=admin.role,
            plant_id=plant_id,
            message=f"Admin role revoked for '{normalized_id}'.",
        )

    def auto_ungrant_for_employee(
        self,
        db: Session,
        *,
        employee_id: str,
        reason: str = "EMPLOYEE_INACTIVE_OR_LEFT_PLANT",
        actor_id: str | None = None,
        actor_role: str | None = "SYSTEM",
        commit: bool = True,
    ) -> list[AdminRevokeResponse]:
        """Deactivate all active admin_roles for an employee (leave / INACTIVE).

        Call from employee-update flows when ``plant_id`` changes or status
        becomes INACTIVE. Does not require an admin portal session.
        """
        normalized_id = (employee_id or "").strip()
        if not normalized_id:
            return []

        rows = admin_role_repository.list_active_for_employee(db, normalized_id)
        # Only plant-scoped admins — never auto-revoke global SUPER via this hook.
        plant_scoped = [row for row in rows if row.plant_id is not None]
        results: list[AdminRevokeResponse] = []
        for admin in plant_scoped:
            admin_role_repository.deactivate(db, admin)
            _audit_revoke(
                db,
                admin=admin,
                actor_id=actor_id,
                actor_role=actor_role,
                reason=reason,
                source="AUTO_UNGRANT",
            )
            results.append(
                AdminRevokeResponse(
                    employee_id=normalized_id,
                    role=admin.role,
                    plant_id=admin.plant_id,  # type: ignore[arg-type]
                    message=f"Admin role auto-revoked for '{normalized_id}'.",
                )
            )

        if commit and plant_scoped:
            db.commit()
            get_shared_admin_auth_service().invalidate_sessions_for_employee(
                normalized_id
            )

        if plant_scoped:
            logger.info(
                "admin_auto_ungrant | employee=%s | count=%s | reason=%s",
                normalized_id,
                len(plant_scoped),
                reason,
            )
        return results


def get_shared_admin_users_service() -> AdminUsersService:
    return AdminUsersService()


__all__ = ["AdminUsersService", "get_shared_admin_users_service"]
