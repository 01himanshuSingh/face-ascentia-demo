"""Admin RBAC data access — portal and kiosk admin login."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models.admin_role import AdminRole


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


__all__ = ["get_active_by_employee_id"]
