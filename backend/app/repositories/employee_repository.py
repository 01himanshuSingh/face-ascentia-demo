"""
Employee data access (Week 1 authentication path).

Thin SQLAlchemy queries only — business rules (ACTIVE check) live in
authentication service.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models.employee import Employee


def get_by_id(db: Session, employee_id: str) -> Employee | None:
    """Load one employee row by business Employee ID."""
    return db.get(Employee, employee_id)


def list_by_plant(db: Session, plant_id: str) -> list[Employee]:
    """Plant-scoped listing for future admin flows (not used by /authenticate)."""
    stmt = select(Employee).where(Employee.plant_id == plant_id)
    return list(db.scalars(stmt).all())
