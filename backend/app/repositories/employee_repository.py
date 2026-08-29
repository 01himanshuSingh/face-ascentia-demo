from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.enums import EmployeeStatus
from app.database.models.employee import Employee


def get_by_id(db: Session, employee_id: str) -> Employee | None:
    """Load one employee row by business Employee ID."""
    return db.get(Employee, employee_id)


def list_by_plant(db: Session, plant_id: str) -> list[Employee]:
    """Plant-scoped listing for admin flows."""
    stmt = select(Employee).where(Employee.plant_id == plant_id)
    return list(db.scalars(stmt).all())


def create_active(
    db: Session,
    *,
    employee_id: str,
    plant_id: uuid.UUID,
    full_name: str,
) -> Employee:
    """Insert ACTIVE employee (admin approve after registration-first intake)."""
    employee = Employee(
        employee_id=employee_id,
        plant_id=plant_id,
        full_name=full_name,
        status=EmployeeStatus.ACTIVE.value,
    )
    db.add(employee)
    db.flush()
    db.refresh(employee)
    return employee


__all__ = ["create_active", "get_by_id", "list_by_plant"]
