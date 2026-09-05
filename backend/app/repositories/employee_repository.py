"""Employee identity data access.

Auth / register use get_by_id. Admin Employees tab lists:
  - ACTIVE workers with ACTIVE enrollment (revoke candidates)
  - INACTIVE workers who left (history roster — employee_id kept)
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.common.enums import AuditAction, EmployeeStatus, EnrollmentStatus
from app.database.models.audit_log import AuditLog
from app.database.models.employee import Employee
from app.database.models.enrollment import Enrollment


@dataclass(frozen=True, slots=True)
class InactiveEmployeeRow:
    """INACTIVE plant worker plus optional revoke context."""

    employee: Employee
    enrollment_id: uuid.UUID | None
    enrolled_at: datetime | None
    revoked_reason: str | None
    left_at: datetime | None


def get_by_id(db: Session, employee_id: str) -> Employee | None:
    """Load one employee row by business Employee ID."""
    return db.get(Employee, employee_id)


def get_by_id_with_plant(db: Session, employee_id: str) -> Employee | None:
    """Employee plus plant row — grant preview and plant derivation."""
    stmt = (
        select(Employee)
        .options(joinedload(Employee.plant))
        .where(Employee.employee_id == employee_id)
        .limit(1)
    )
    return db.scalars(stmt).first()


def list_by_plant(db: Session, plant_id: str) -> list[Employee]:
    """Plant-scoped listing for admin flows."""
    stmt = select(Employee).where(Employee.plant_id == plant_id)
    return list(db.scalars(stmt).all())


def _name_or_id_filter(q: str | None):
    normalized_q = (q or "").strip()
    if not normalized_q:
        return None
    pattern = f"%{normalized_q}%"
    return or_(
        Employee.employee_id.ilike(pattern),
        Employee.full_name.ilike(pattern),
    )


def list_active_enrolled_by_plant(
    db: Session,
    plant_id: uuid.UUID,
    *,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[tuple[Employee, Enrollment]]:
    """ACTIVE employees in plant with an ACTIVE face enrollment (roster)."""
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)

    stmt = (
        select(Employee, Enrollment)
        .join(
            Enrollment,
            Enrollment.employee_id == Employee.employee_id,
        )
        .where(
            Employee.plant_id == plant_id,
            Employee.status == EmployeeStatus.ACTIVE.value,
            Enrollment.status == EnrollmentStatus.ACTIVE.value,
            Enrollment.plant_id == plant_id,
        )
    )

    name_filter = _name_or_id_filter(q)
    if name_filter is not None:
        stmt = stmt.where(name_filter)

    stmt = (
        stmt.order_by(Employee.full_name.asc(), Employee.employee_id.asc())
        .offset(safe_offset)
        .limit(safe_limit)
    )
    return list(db.execute(stmt).all())


def count_active_enrolled_by_plant(
    db: Session,
    plant_id: uuid.UUID,
    *,
    q: str | None = None,
) -> int:
    stmt = (
        select(func.count())
        .select_from(Employee)
        .join(
            Enrollment,
            Enrollment.employee_id == Employee.employee_id,
        )
        .where(
            Employee.plant_id == plant_id,
            Employee.status == EmployeeStatus.ACTIVE.value,
            Enrollment.status == EnrollmentStatus.ACTIVE.value,
            Enrollment.plant_id == plant_id,
        )
    )
    name_filter = _name_or_id_filter(q)
    if name_filter is not None:
        stmt = stmt.where(name_filter)
    return int(db.scalar(stmt) or 0)


def list_inactive_by_plant(
    db: Session,
    plant_id: uuid.UUID,
    *,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[InactiveEmployeeRow]:
    """INACTIVE workers in plant (left / revoked) — history roster.

    Joins latest REVOKED enrollment (reason + enrolled_at) and latest
    EMPLOYEE_REVOKE audit (left_at) when present.
    """
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)

    enroll_rank = (
        select(
            Enrollment.enrollment_id.label("enrollment_id"),
            Enrollment.employee_id.label("employee_id"),
            Enrollment.created_at.label("enrolled_at"),
            Enrollment.revoked_reason.label("revoked_reason"),
            func.row_number()
            .over(
                partition_by=Enrollment.employee_id,
                order_by=Enrollment.created_at.desc(),
            )
            .label("rn"),
        )
        .where(
            Enrollment.plant_id == plant_id,
            Enrollment.status == EnrollmentStatus.REVOKED.value,
        )
        .subquery()
    )

    audit_rank = (
        select(
            AuditLog.target_id.label("employee_id"),
            AuditLog.created_at.label("left_at"),
            func.row_number()
            .over(
                partition_by=AuditLog.target_id,
                order_by=AuditLog.created_at.desc(),
            )
            .label("rn"),
        )
        .where(
            AuditLog.plant_id == plant_id,
            AuditLog.action == AuditAction.EMPLOYEE_REVOKE.value,
            AuditLog.target_type == "employee",
        )
        .subquery()
    )

    stmt = (
        select(
            Employee,
            enroll_rank.c.enrollment_id,
            enroll_rank.c.enrolled_at,
            enroll_rank.c.revoked_reason,
            audit_rank.c.left_at,
        )
        .outerjoin(
            enroll_rank,
            and_(
                enroll_rank.c.employee_id == Employee.employee_id,
                enroll_rank.c.rn == 1,
            ),
        )
        .outerjoin(
            audit_rank,
            and_(
                audit_rank.c.employee_id == Employee.employee_id,
                audit_rank.c.rn == 1,
            ),
        )
        .where(
            Employee.plant_id == plant_id,
            Employee.status == EmployeeStatus.INACTIVE.value,
        )
    )

    name_filter = _name_or_id_filter(q)
    if name_filter is not None:
        stmt = stmt.where(name_filter)

    stmt = (
        stmt.order_by(
            audit_rank.c.left_at.desc().nulls_last(),
            Employee.full_name.asc(),
            Employee.employee_id.asc(),
        )
        .offset(safe_offset)
        .limit(safe_limit)
    )

    return [
        InactiveEmployeeRow(
            employee=employee,
            enrollment_id=enrollment_id,
            enrolled_at=enrolled_at,
            revoked_reason=revoked_reason,
            left_at=left_at,
        )
        for employee, enrollment_id, enrolled_at, revoked_reason, left_at in db.execute(
            stmt
        ).all()
    ]


def count_inactive_by_plant(
    db: Session,
    plant_id: uuid.UUID,
    *,
    q: str | None = None,
) -> int:
    stmt = select(func.count()).select_from(Employee).where(
        Employee.plant_id == plant_id,
        Employee.status == EmployeeStatus.INACTIVE.value,
    )
    name_filter = _name_or_id_filter(q)
    if name_filter is not None:
        stmt = stmt.where(name_filter)
    return int(db.scalar(stmt) or 0)


def set_inactive(db: Session, employee: Employee) -> Employee:
    """Soft-deactivate worker identity. Caller owns commit."""
    employee.status = EmployeeStatus.INACTIVE.value
    db.flush()
    db.refresh(employee)
    return employee


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


__all__ = [
    "InactiveEmployeeRow",
    "count_active_enrolled_by_plant",
    "count_inactive_by_plant",
    "create_active",
    "get_by_id",
    "get_by_id_with_plant",
    "list_active_enrolled_by_plant",
    "list_by_plant",
    "list_inactive_by_plant",
    "set_inactive",
]
