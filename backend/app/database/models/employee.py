from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.enums import EmployeeStatus
from app.database.base import Base

if TYPE_CHECKING:
    from app.database.models.enrollment import Enrollment
    from app.database.models.plant import Plant


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (
        CheckConstraint(
            "status IN ('ACTIVE', 'INACTIVE')",
            name="ck_employees_status",
        ),
        Index("idx_employees_plant", "plant_id"),
    )

    employee_id: Mapped[str] = mapped_column(Text, primary_key=True)
    plant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.plant_id"),
        nullable=False,
    )
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    department: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=EmployeeStatus.ACTIVE.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    plant: Mapped[Plant] = relationship(back_populates="employees")
    enrollments: Mapped[list[Enrollment]] = relationship(
        back_populates="employee",
        foreign_keys="Enrollment.employee_id",
    )
