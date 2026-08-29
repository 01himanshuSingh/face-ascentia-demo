"""
Enrollment data access (Week 1 authentication path).

Authentication reads exactly one ACTIVE template per employee (1:1 verify).
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.enums import EnrollmentStatus
from app.database.models.enrollment import Enrollment


def get_active_by_employee_id(
    db: Session,
    employee_id: str,
) -> Enrollment | None:
    """Return the ACTIVE enrollment row for Employee ID, if any."""
    stmt = (
        select(Enrollment)
        .where(
            Enrollment.employee_id == employee_id,
            Enrollment.status == EnrollmentStatus.ACTIVE.value,
        )
        .limit(1)
    )
    return db.scalars(stmt).first()


def create_active(
    db: Session,
    *,
    employee_id: str,
    plant_id: uuid.UUID,
    embedding: list[float],
    model_version: str,
    source_request_id: uuid.UUID | None = None,
) -> Enrollment:
    enrollment = Enrollment(
        employee_id=employee_id,
        plant_id=plant_id,
        embedding=embedding,
        status=EnrollmentStatus.ACTIVE.value,
        model_version=model_version,
        source_request_id=source_request_id,
    )
    db.add(enrollment)
    db.flush()
    db.refresh(enrollment)
    return enrollment


__all__ = ["create_active", "get_active_by_employee_id"]
