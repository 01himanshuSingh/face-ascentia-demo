"""Admin RBAC enforcement — v1 policy layer.

Single place for permission and plant-scope checks used by Admin Portal and
grant API. Default permission sets live in ``app.common.enums``; effective
grants are rows in ``admin_role_permissions`` (future SUPER UI may edit those).

v1 active roles: SUPER_ADMIN, PLANT_ADMIN (SUB_ADMIN reserved, not grantable).

Grant policy (``POST /admin/users/grant``):
  - Same permission ``ADMIN_GRANT_PLANT_ADMIN`` for SUPER and PLANT admin.
  - ``admin_roles.plant_id`` is derived from ``employees.plant_id`` (not chosen).
  - SUPER_ADMIN may grant any enrolled employee (any plant).
  - PLANT_ADMIN may grant only when ``employees.plant_id == session.plant_id``.

Registration review uses ``assert_can_manage_plant`` + registration permissions.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.common.enums import (
    ADMIN_ROLE_DEFAULT_PERMISSIONS,
    AdminPermissionCode,
    AdminRoleType,
)
from app.common.exceptions import AdminError
from app.repositories import admin_role_repository, employee_repository
from app.schemas.admin import AdminErrorCode
from app.services.admin_auth import AdminSession

# Roles that may be granted via POST /admin/users/grant in v1.
GRANTABLE_ADMIN_ROLES_V1: frozenset[AdminRoleType] = frozenset({AdminRoleType.PLANT_ADMIN})


def permission_codes_for_role(role: AdminRoleType) -> set[str]:
    return {code.value for code in ADMIN_ROLE_DEFAULT_PERMISSIONS[role]}


def assign_default_permissions(
    db: Session,
    *,
    role_id: uuid.UUID,
    role: AdminRoleType,
) -> None:
    admin_role_repository.assign_permissions(
        db,
        role_id=role_id,
        permission_codes=permission_codes_for_role(role),
    )


def session_has_permission(session: AdminSession, code: AdminPermissionCode) -> bool:
    return code.value in session.permissions


def assert_permission(session: AdminSession, code: AdminPermissionCode) -> None:
    if not session_has_permission(session, code):
        raise AdminError(
            f"Missing permission: {code.value}",
            code=AdminErrorCode.PERMISSION_DENIED,
            http_status=403,
        )


def assert_can_manage_plant(session: AdminSession, plant_id: uuid.UUID) -> None:
    """Enforce plant workspace boundary for the current session.

    SUPER_ADMIN bypasses (all plants). PLANT_ADMIN must match ``session.plant_id``.
    Used for registration review, image access, approve/reject, and grant targets.
    """
    if session.role == AdminRoleType.SUPER_ADMIN.value:
        return
    if session.plant_id != plant_id:
        raise AdminError(
            "Access denied for this plant.",
            code=AdminErrorCode.PLANT_ACCESS_DENIED,
            http_status=403,
        )


def assert_can_grant_role(
    session: AdminSession,
    *,
    target_role: AdminRoleType,
    target_plant_id: uuid.UUID | None,
) -> None:
    """Authorize granter for ``POST /admin/users/grant``.

    Two-step gate for PLANT_ADMIN grants:
      1. Permission — ``ADMIN_GRANT_PLANT_ADMIN`` on session.
      2. Plant scope — granter may only assign within plants they manage.

    SUPER_ADMIN cannot be granted via API. SUB_ADMIN is catalog-only in v1.
    """
    if target_role == AdminRoleType.SUB_ADMIN:
        raise AdminError(
            "SUB_ADMIN is not enabled in v1. Use PLANT_ADMIN per plant.",
            code=AdminErrorCode.PERMISSION_DENIED,
            http_status=403,
        )

    if target_role == AdminRoleType.SUPER_ADMIN:
        raise AdminError(
            "SUPER_ADMIN cannot be granted via API.",
            code=AdminErrorCode.PERMISSION_DENIED,
            http_status=403,
        )

    if target_role not in GRANTABLE_ADMIN_ROLES_V1:
        raise AdminError(
            f"Role '{target_role.value}' cannot be granted.",
            code=AdminErrorCode.PERMISSION_DENIED,
            http_status=403,
        )

    if target_role == AdminRoleType.PLANT_ADMIN:
        assert_permission(session, AdminPermissionCode.ADMIN_GRANT_PLANT_ADMIN)
        if target_plant_id is None:
            raise AdminError(
                "plant_id is required for PLANT_ADMIN.",
                code=AdminErrorCode.PLANT_ACCESS_DENIED,
                http_status=400,
            )
        assert_can_manage_plant(session, target_plant_id)
        return

    raise AdminError(
        f"Unknown target role: {target_role}",
        code=AdminErrorCode.PERMISSION_DENIED,
        http_status=403,
    )


def assert_target_employee_exists(db: Session, employee_id: str) -> None:
    employee = employee_repository.get_by_id(db, employee_id)
    if employee is None:
        raise AdminError(
            f"Employee '{employee_id}' not found. Enroll as worker first.",
            code=AdminErrorCode.EMPLOYEE_NOT_FOUND,
            http_status=404,
        )


__all__ = [
    "GRANTABLE_ADMIN_ROLES_V1",
    "assert_can_grant_role",
    "assert_can_manage_plant",
    "assert_permission",
    "assert_target_employee_exists",
    "assign_default_permissions",
    "permission_codes_for_role",
    "session_has_permission",
]
