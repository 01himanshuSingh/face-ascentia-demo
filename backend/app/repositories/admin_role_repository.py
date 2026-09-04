"""Admin role and permission data access.

System boundary
---------------
Repository owns SQLAlchemy reads/writes for ``admin_roles`` and
``admin_role_permissions`` only. It does NOT:

- Check who may list/revoke (admin_rbac / admin_users)
- Write audit_log (admin_users service)
- Commit the transaction (service commits after audit)

Ungrant / auto-ungrant = soft-deactivate (``is_active=False``).
Rows are kept so the same employee can be re-granted later.
Employees / enrollments are never touched here.

Scalable list path
------------------
``list_active_by_plant`` filters in SQL (plant + optional role set + search)
with limit/offset — ready for SUPER plant-admin roster and future
plant-scoped sub-admin lists without loading all admins into memory.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.common.enums import AdminRoleType
from app.database.models.admin_role import AdminRole
from app.database.models.admin_role_permission import AdminRolePermission
from app.database.models.employee import Employee

# Default roster for plant workspace UI (v1). Future: pass {SUB_ADMIN} for
# plant-admin → sub-admin revoke lists without a new repository function.
_DEFAULT_PLANT_SCOPED_ROLES: frozenset[str] = frozenset(
    {
        AdminRoleType.PLANT_ADMIN.value,
    }
)


def get_active_by_employee_id(db: Session, employee_id: str) -> AdminRole | None:
    stmt = (
        select(AdminRole)
        .where(
            AdminRole.employee_id == employee_id,
            AdminRole.is_active.is_(True),
        )
        .limit(1)
    )
    return db.scalars(stmt).first()


def get_by_employee_id(db: Session, employee_id: str) -> AdminRole | None:
    return db.scalars(
        select(AdminRole).where(AdminRole.employee_id == employee_id).limit(1)
    ).first()


def get_active_by_employee_and_plant(
    db: Session,
    employee_id: str,
    plant_id: uuid.UUID,
) -> AdminRole | None:
    """Active admin row for employee scoped to one plant workspace."""
    stmt = (
        select(AdminRole)
        .where(
            AdminRole.employee_id == employee_id,
            AdminRole.plant_id == plant_id,
            AdminRole.is_active.is_(True),
        )
        .limit(1)
    )
    return db.scalars(stmt).first()


def list_active_by_plant(
    db: Session,
    plant_id: uuid.UUID,
    *,
    q: str | None = None,
    roles: frozenset[str] | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[AdminRole]:
    """Active plant-scoped admins for one workspace (search + pagination).

    Parameters
    ----------
    plant_id:
        Workspace plant — never NULL (SUPER global admins are not listed here).
    q:
        Optional search on employee_id or full_name (case-insensitive contains).
    roles:
        Role filter. Default = PLANT_ADMIN only. Pass {SUB_ADMIN} later for
        plant-admin managing sub-admins in the same plant.
    """
    role_filter = roles if roles is not None else _DEFAULT_PLANT_SCOPED_ROLES
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)

    stmt = (
        select(AdminRole)
        .join(Employee, Employee.employee_id == AdminRole.employee_id)
        .options(joinedload(AdminRole.employee))
        .where(
            AdminRole.plant_id == plant_id,
            AdminRole.is_active.is_(True),
            AdminRole.role.in_(role_filter),
        )
    )

    normalized_q = (q or "").strip()
    if normalized_q:
        pattern = f"%{normalized_q}%"
        stmt = stmt.where(
            or_(
                Employee.employee_id.ilike(pattern),
                Employee.full_name.ilike(pattern),
            )
        )

    stmt = (
        stmt.order_by(Employee.full_name.asc(), AdminRole.employee_id.asc())
        .offset(safe_offset)
        .limit(safe_limit)
    )
    return list(db.scalars(stmt).unique().all())


def count_active_by_plant(
    db: Session,
    plant_id: uuid.UUID,
    *,
    q: str | None = None,
    roles: frozenset[str] | None = None,
) -> int:
    """Total matching rows for pagination UIs (same filters as list)."""
    role_filter = roles if roles is not None else _DEFAULT_PLANT_SCOPED_ROLES

    stmt = (
        select(func.count())
        .select_from(AdminRole)
        .join(Employee, Employee.employee_id == AdminRole.employee_id)
        .where(
            AdminRole.plant_id == plant_id,
            AdminRole.is_active.is_(True),
            AdminRole.role.in_(role_filter),
        )
    )

    normalized_q = (q or "").strip()
    if normalized_q:
        pattern = f"%{normalized_q}%"
        stmt = stmt.where(
            or_(
                Employee.employee_id.ilike(pattern),
                Employee.full_name.ilike(pattern),
            )
        )

    return int(db.scalar(stmt) or 0)


def list_active_for_employee(db: Session, employee_id: str) -> list[AdminRole]:
    """All active admin rows for one employee (auto-ungrant when leaving plant)."""
    stmt = select(AdminRole).where(
        AdminRole.employee_id == employee_id,
        AdminRole.is_active.is_(True),
    )
    return list(db.scalars(stmt).all())


def deactivate(db: Session, admin: AdminRole) -> AdminRole:
    """Soft-ungrant one admin_roles row. Caller writes audit + commits."""
    admin.is_active = False
    db.flush()
    db.refresh(admin)
    return admin


def reactivate(
    db: Session,
    admin: AdminRole,
    *,
    plant_id: uuid.UUID | None,
    role: str,
    password_hash: str,
    granted_by: str | None,
) -> AdminRole:
    """Re-grant an inactive admin_roles row (same employee_id unique key).

    Caller clears/reassigns permissions + writes audit + commits.
    """
    admin.plant_id = plant_id
    admin.role = role
    admin.password_hash = password_hash
    admin.is_active = True
    admin.granted_by = granted_by
    db.flush()
    db.refresh(admin)
    return admin


def deactivate_active_for_employee(
    db: Session,
    employee_id: str,
) -> list[AdminRole]:
    """Soft-ungrant every active admin role for an employee (left plant / INACTIVE)."""
    rows = list_active_for_employee(db, employee_id)
    for admin in rows:
        admin.is_active = False
    if rows:
        db.flush()
        for admin in rows:
            db.refresh(admin)
    return rows


def deactivate_active_for_employee_in_plant(
    db: Session,
    employee_id: str,
    plant_id: uuid.UUID,
) -> AdminRole | None:
    """Soft-ungrant active admin for employee in one workspace only."""
    admin = get_active_by_employee_and_plant(db, employee_id, plant_id)
    if admin is None:
        return None
    return deactivate(db, admin)


def list_permission_codes(db: Session, role_id: uuid.UUID) -> list[str]:
    stmt = select(AdminRolePermission.permission_code).where(
        AdminRolePermission.role_id == role_id
    )
    return list(db.scalars(stmt).all())


def assign_permissions(
    db: Session,
    *,
    role_id: uuid.UUID,
    permission_codes: set[str],
) -> None:
    for code in permission_codes:
        db.add(
            AdminRolePermission(
                role_id=role_id,
                permission_code=code,
            )
        )
    db.flush()


def clear_permissions(db: Session, role_id: uuid.UUID) -> None:
    for row in db.scalars(
        select(AdminRolePermission).where(AdminRolePermission.role_id == role_id)
    ).all():
        db.delete(row)
    db.flush()


__all__ = [
    "assign_permissions",
    "clear_permissions",
    "count_active_by_plant",
    "deactivate",
    "deactivate_active_for_employee",
    "deactivate_active_for_employee_in_plant",
    "get_active_by_employee_and_plant",
    "get_active_by_employee_id",
    "get_by_employee_id",
    "list_active_by_plant",
    "list_active_for_employee",
    "list_permission_codes",
    "reactivate",
]
