from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.enums import RegistrationStatus
from app.database.base import Base

if TYPE_CHECKING:
    from app.database.models.employee import Employee
    from app.database.models.plant import Plant
    from app.database.models.raw_image import RawImage


class RegistrationRequest(Base):
    """
    Registration attempt metadata — permanent history, status-driven lifecycle.

    Kiosk employee self-register (Path A): created by POST /register after the employee
    failed authenticate with ENROLLMENT_NOT_FOUND. The face JPEG is usually the same
    capture reused from the auth attempt (SDK-side); stored via raw_images.

    Image bytes live in raw_images (never joined in list queries).

    kiosk_id is optional (nullable). Current rollout: Path A and Path B omit kiosk
    device id — column is NULL until fleet registry exists.

    session_id links to the SDK capture session (blink/burst that produced the
    JPEG). Path A register should store the same session_id as the auth capture.
    Column nullable until SDK sends session ids.
    """

    __tablename__ = "registration_requests"
    __table_args__ = (
        CheckConstraint(
            "source IN ('KIOSK', 'ADMIN_PORTAL', 'ADMIN_KIOSK')",
            name="ck_registration_requests_source",
        ),
        CheckConstraint(
            "status IN ('PENDING', 'APPROVED', 'REJECTED')",
            name="ck_registration_requests_status",
        ),
        Index("idx_registration_requests_employee_id", "employee_id"),
        Index("idx_reqs_plant_status", "plant_id", "status"),
        Index(
            "idx_one_pending_per_emp",
            "employee_id",
            unique=True,
            postgresql_where=text("status = 'PENDING'"),
        ),
    )

    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    employee_id: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    plant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.plant_id"),
        nullable=False,
    )
    kiosk_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=RegistrationStatus.PENDING.value,
    )
    submitted_full_name: Mapped[str] = mapped_column(Text, nullable=False)
    session_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(
        Text,
        ForeignKey("employees.employee_id"),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    employee: Mapped[Employee | None] = relationship(
        foreign_keys=[employee_id],
        primaryjoin="RegistrationRequest.employee_id == Employee.employee_id",
        viewonly=True,
    )
    plant: Mapped[Plant] = relationship()
    reviewer: Mapped[Employee | None] = relationship(
        foreign_keys=[reviewed_by],
    )
    raw_image: Mapped[RawImage | None] = relationship(
        back_populates="request",
        uselist=False,
    )
