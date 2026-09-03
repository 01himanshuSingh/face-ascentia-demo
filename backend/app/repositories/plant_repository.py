"""Plant data access — kiosk picker, workspace scoping, admin catalog CRUD.

System boundary
---------------
Repository owns SQLAlchemy reads/writes only. It does NOT:

- Check PLANTS_MANAGE (plant_catalog / admin_rbac)
- Write audit_log (plant_catalog service)
- Commit the transaction (service commits after audit)

Public kiosk Path A uses list_active. Admin catalog uses list_all (incl. inactive).
Soft-deactivate = set is_active=False — never hard-delete here.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database.models.employee import Employee
from app.database.models.enrollment import Enrollment
from app.database.models.plant import Plant
from app.database.models.registration_request import RegistrationRequest


def get_by_id(db: Session, plant_id: uuid.UUID) -> Plant | None:
    return db.get(Plant, plant_id)


def get_by_code(db: Session, plant_code: str) -> Plant | None:
    """Lookup by unique plant_code (normalized uppercase at service/schema layer)."""
    stmt = select(Plant).where(Plant.plant_code == plant_code).limit(1)
    return db.scalars(stmt).first()


def list_active(db: Session) -> list[Plant]:
    """Active plants only — kiosk Register UI and SUPER workspace selector."""
    stmt = (
        select(Plant)
        .where(Plant.is_active.is_(True))
        .order_by(Plant.plant_name)
    )
    return list(db.scalars(stmt).all())


def list_all(db: Session) -> list[Plant]:
    """Full catalog including inactive — admin Plants tab (PLANTS_MANAGE)."""
    stmt = select(Plant).order_by(Plant.is_active.desc(), Plant.plant_name)
    return list(db.scalars(stmt).all())


def create(
    db: Session,
    *,
    plant_code: str,
    plant_name: str,
    is_active: bool = True,
) -> Plant:
    """Insert a plant row. Caller must ensure plant_code uniqueness."""
    plant = Plant(
        plant_code=plant_code,
        plant_name=plant_name,
        is_active=is_active,
    )
    db.add(plant)
    db.flush()
    db.refresh(plant)
    return plant


def update(
    db: Session,
    plant: Plant,
    *,
    plant_code: str | None = None,
    plant_name: str | None = None,
    is_active: bool | None = None,
) -> Plant:
    """Apply partial field updates on an existing plant (soft-deactivate via is_active)."""
    if plant_code is not None:
        plant.plant_code = plant_code
    if plant_name is not None:
        plant.plant_name = plant_name
    if is_active is not None:
        plant.is_active = is_active
    db.flush()
    db.refresh(plant)
    return plant


def count_dependent_rows(db: Session, plant_id: uuid.UUID) -> dict[str, int]:
    """Counts used by plant_catalog before soft-deactivate policy decisions."""
    employees = db.scalar(
        select(func.count()).select_from(Employee).where(Employee.plant_id == plant_id)
    )
    enrollments = db.scalar(
        select(func.count())
        .select_from(Enrollment)
        .where(Enrollment.plant_id == plant_id)
    )
    registrations = db.scalar(
        select(func.count())
        .select_from(RegistrationRequest)
        .where(RegistrationRequest.plant_id == plant_id)
    )
    return {
        "employees": int(employees or 0),
        "enrollments": int(enrollments or 0),
        "registrations": int(registrations or 0),
    }


__all__ = [
    "count_dependent_rows",
    "create",
    "get_by_code",
    "get_by_id",
    "list_active",
    "list_all",
    "update",
]
