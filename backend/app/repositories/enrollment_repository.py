"""
Enrollment data access (Week 1 authentication path).

Authentication reads exactly one ACTIVE template per employee (1:1 verify).
"""

from __future__ import annotations

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
