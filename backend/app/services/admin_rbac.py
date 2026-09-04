"""Admin RBAC enforcement — permission + plant-scope policy layer.

Single place for authorization used by Admin Portal (review, grant, revoke,
plant catalog). Default permission *templates* live in ``app.common.enums``;
effective grants are rows in ``admin_role_permissions`` (future RBAC UI).

Runtime feature ACL
-------------------
Gate on ``session.permissions`` (DB), not ``session.role == SUPER_ADMIN``.

Plant scope
-----------
  session.plant_id is None  → global lens (typically SUPER); all plants
  session.plant_id = UUID   → locked to that plant (PLANT_ADMIN / future SUB)

Do not confuse global lens with SUPER's *workspace toggle* (client ``plantId``
query). Toggle never rewrites ``admin_roles.plant_id``.

Grant (``POST /admin/users/grant``)
-----------------------------------
  Permission ADMIN_GRANT_PLANT_ADMIN + assert_can_manage_plant(target plant).
  Target plant derived from employees.plant_id.

Revoke / plant-admin roster (``GET/POST /admin/users*``)
--------------------------------------------------------
  v1: only **global** sessions may list/ungrant PLANT_ADMIN in a workspace.
      Plant admins cannot ungrant peer plant admins.
  Future: plant-scoped session may ungrant SUB_ADMIN in own plant only
      (same helpers; widen REVOCABLE_BY_SCOPE / permissions).

Auto-ungrant (employee left plant / INACTIVE) is a domain action in
``admin_users`` — no interactive RBAC check; still writes audit REVOKE.
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
GRANTABLE_ADMIN_ROLES_V1: frozenset[AdminRoleType] = frozenset(
    {AdminRoleType.PLANT_ADMIN}
)

# Roles a **global** session may revoke in a plant workspace (v1).
REVOCABLE_BY_GLOBAL_SESSION: frozenset[AdminRoleType] = frozenset(
    {AdminRoleType.PLANT_ADMIN}
)

# Roles a **plant-scoped** session may revoke in own plant (future SUB_ADMIN).
# Empty in v1 — plant admins cannot ungrant peers.
REVOCABLE_BY_PLANT_SESSION: frozenset[AdminRoleType] = frozenset()


def is_global_admin_session(session: AdminSession) -> bool:
    """True when admin is not locked to one plant (may operate across workspaces)."""
    return session.plant_id is None


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

    Global sessions (``plant_id is None``) may access any plant.
    Plant-scoped sessions must match ``session.plant_id``.
    """
    if is_global_admin_session(session):
        return
    if session.plant_id != plant_id:
        raise AdminError(
            "Access denied for this plant.",
            code=AdminErrorCode.PLANT_ACCESS_DENIED,
            http_status=403,
        )


def revocable_roles_for_session(session: AdminSession) -> frozenset[AdminRoleType]:
    """Which target roles this session may list/revoke (scalable matrix)."""
    if is_global_admin_session(session):
        return REVOCABLE_BY_GLOBAL_SESSION
    return REVOCABLE_BY_PLANT_SESSION


def assert_can_list_plant_admins(
    session: AdminSession,
    *,
    plant_id: uuid.UUID,
) -> None:
    """Authorize GET /admin/users?plantId= roster for a workspace.

    v1: global session + ADMIN_GRANT_PLANT_ADMIN (manage plant admins capability).
    Future: plant session may list SUB_ADMIN only when revocable set is non-empty.
    """
    allowed = revocable_roles_for_session(session)
    if not allowed:
        raise AdminError(
            "Plant-scoped admins cannot list or manage peer admin roles.",
            code=AdminErrorCode.PERMISSION_DENIED,
            http_status=403,
        )

    # v1 roster is plant-admin management — same capability as grant.
    if AdminRoleType.PLANT_ADMIN in allowed:
        assert_permission(session, AdminPermissionCode.ADMIN_GRANT_PLANT_ADMIN)
    elif AdminRoleType.SUB_ADMIN in allowed:
        assert_permission(session, AdminPermissionCode.ADMIN_GRANT_SUB_ADMIN)

    assert_can_manage_plant(session, plant_id)


def assert_can_revoke_admin(
    session: AdminSession,
    *,
    target_role: AdminRoleType | str,
    target_plant_id: uuid.UUID | None,
) -> None:
    """Authorize POST /admin/users/{employeeId}/revoke.

    v1 policy
    ---------
    - Only global sessions may revoke.
    - Target must be PLANT_ADMIN with a concrete plant_id.
    - SUPER_ADMIN cannot be revoked via this API.
    - Plant admins cannot ungrant partners (revocable set empty for plant session).

    Future
    ------
    Widen ``REVOCABLE_BY_PLANT_SESSION`` to {SUB_ADMIN} and map
    ADMIN_GRANT_SUB_ADMIN (or a dedicated revoke permission) — same function.
    """
    if isinstance(target_role, str):
        try:
            target_role = AdminRoleType(target_role.strip().upper())
        except ValueError as exc:
            raise AdminError(
                f"Invalid target role: {target_role}",
                code=AdminErrorCode.PERMISSION_DENIED,
                http_status=400,
            ) from exc

    if target_role == AdminRoleType.SUPER_ADMIN:
        raise AdminError(
            "SUPER_ADMIN cannot be revoked via API.",
            code=AdminErrorCode.PERMISSION_DENIED,
            http_status=403,
        )

    allowed = revocable_roles_for_session(session)
    if target_role not in allowed:
        if not is_global_admin_session(session):
            raise AdminError(
                "Plant-scoped admins cannot ungrant peer admins.",
                code=AdminErrorCode.PERMISSION_DENIED,
                http_status=403,
            )
        raise AdminError(
            f"Role '{target_role.value}' cannot be revoked.",
            code=AdminErrorCode.PERMISSION_DENIED,
            http_status=403,
        )

    if target_plant_id is None:
        raise AdminError(
            "plantId is required to revoke a plant-scoped admin.",
            code=AdminErrorCode.PLANT_ACCESS_DENIED,
            http_status=400,
        )

    if target_role == AdminRoleType.PLANT_ADMIN:
        assert_permission(session, AdminPermissionCode.ADMIN_GRANT_PLANT_ADMIN)
        assert_can_manage_plant(session, target_plant_id)
        return

    if target_role == AdminRoleType.SUB_ADMIN:
        # Wired for future plant→sub-admin revoke; blocked while set is empty
        # or when grant-sub permission is not assigned.
        assert_permission(session, AdminPermissionCode.ADMIN_GRANT_SUB_ADMIN)
        assert_can_manage_plant(session, target_plant_id)
        return

    raise AdminError(
        f"Unknown target role: {target_role}",
        code=AdminErrorCode.PERMISSION_DENIED,
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
    "REVOCABLE_BY_GLOBAL_SESSION",
    "REVOCABLE_BY_PLANT_SESSION",
    "assert_can_grant_role",
    "assert_can_list_plant_admins",
    "assert_can_manage_plant",
    "assert_can_revoke_admin",
    "assert_permission",
    "assert_target_employee_exists",
    "assign_default_permissions",
    "is_global_admin_session",
    "permission_codes_for_role",
    "revocable_roles_for_session",
    "session_has_permission",
]
