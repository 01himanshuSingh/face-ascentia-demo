from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import CheckConstraint

from app.common.enums import EnrollmentStatus
from app.core.config import settings
from app.database.base import Base

if TYPE_CHECKING:
    from app.database.models.employee import Employee
    from app.database.models.plant import Plant


class Enrollment(Base):
    """
    Face enrollment template used by authentication.

    Week 1 note:
    - source_request_id is stored as a nullable UUID without FK until
      registration_requests is implemented in a later phase.
    - VECTOR dimension is provisional (schema docs); verify against SFace
      before production migrations are considered final.
    """

    __tablename__ = "enrollments"
    __table_args__ = (
        CheckConstraint(
            "status IN ('ACTIVE', 'REVOKED')",
            name="ck_enrollments_status",
        ),
        Index("idx_enrollments_employee_id", "employee_id"),
        Index("idx_enrollments_plant_id", "plant_id"),
        Index(
            "idx_enroll_active_emp",
            "employee_id",
            unique=True,
            postgresql_where=text("status = 'ACTIVE'"),
        ),
    )

    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    employee_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("employees.employee_id"),
        nullable=False,
    )
    plant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.plant_id"),
        nullable=False,
    )
    embedding: Mapped[list[float]] = mapped_column(
        Vector(settings.face_embedding_dimensions),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=EnrollmentStatus.ACTIVE.value,
    )
    # FK to registration_requests deferred until that table exists (Week 1).
    source_request_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    model_version: Mapped[str] = mapped_column(Text, nullable=False)
    revoked_by: Mapped[str | None] = mapped_column(
        Text,
        ForeignKey("employees.employee_id"),
        nullable=True,
    )
    revoked_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    employee: Mapped[Employee] = relationship(
        back_populates="enrollments",
        foreign_keys=[employee_id],
    )
    plant: Mapped[Plant] = relationship(back_populates="enrollments")
    revoked_by_employee: Mapped[Employee | None] = relationship(
        foreign_keys=[revoked_by],
    )
