from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

if TYPE_CHECKING:
    from app.database.models.employee import Employee
    from app.database.models.plant import Plant


class AdminRole(Base):
    """Maps an employee to an admin role and plant workspace (RBAC)."""

    __tablename__ = "admin_roles"
    __table_args__ = (
        CheckConstraint(
            "role IN ('PLANT_ADMIN', 'SUPER_ADMIN')",
            name="ck_admin_roles_role",
        ),
        Index("idx_admin_roles_plant_id", "plant_id"),
    )

    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    employee_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("employees.employee_id"),
        nullable=False,
        unique=True,
    )
    plant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.plant_id"),
        nullable=True,
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="true",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    employee: Mapped[Employee] = relationship()
    plant: Mapped[Plant | None] = relationship()
