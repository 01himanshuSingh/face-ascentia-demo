"""Admin role and permission data access."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models.admin_role import AdminRole
from app.database.models.admin_role_permission import AdminRolePermission


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
    "get_active_by_employee_id",
    "get_by_employee_id",
    "list_permission_codes",
]
