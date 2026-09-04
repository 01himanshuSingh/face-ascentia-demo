"""Audit log ORM — append-only compliance trail (one table for all actions).

System design
-------------
- Portal reads a **filtered timeline** over this table (not separate tables
  per action). Category chips map to ``action IN (...)`` in the service.
- Workspace boundary is ``plant_id`` — every list query must filter plant
  first so ``idx_audit_plant_time (plant_id, created_at)`` is used.
- Keyset pagination (next file: repository list) uses
  ``(created_at DESC, log_id DESC)`` — ``log_id`` breaks timestamp ties.
- Face images are **never** stored or joined here. Metadata is JSON only;
  registration photos stay on ``raw_images`` + dedicated image routes.
- Application code must never UPDATE or DELETE rows (append-only).
  Partition by month later if volume requires it — schema stays the same.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

if TYPE_CHECKING:
    from app.database.models.employee import Employee
    from app.database.models.plant import Plant


class AuditLog(Base):
    """One immutable audit event. Writers: review / grant / revoke / plants / kiosk."""

    __tablename__ = "audit_log"
    __table_args__ = (
        # Portal: WHERE plant_id = ? AND created_at BETWEEN … ORDER BY created_at DESC
        Index("idx_audit_plant_time", "plant_id", "created_at"),
    )

    log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    actor_id: Mapped[str | None] = mapped_column(
        Text,
        ForeignKey("employees.employee_id"),
        nullable=True,
    )
    actor_role: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Values from AuditAction (TEXT keeps catalog extensible without migrations).
    action: Mapped[str] = mapped_column(Text, nullable=False)
    target_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    plant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.plant_id"),
        nullable=False,
    )
    ip_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata",
        JSONB,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    actor: Mapped[Employee | None] = relationship()
    plant: Mapped[Plant] = relationship()
