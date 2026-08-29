from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, LargeBinary, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

if TYPE_CHECKING:
    from app.database.models.registration_request import RegistrationRequest


class RawImage(Base):
    """
    Captured registration photo — 1:1 with registration_requests.

    Fetched on-demand by request_id only; list/history queries must not join this table.
    """

    __tablename__ = "raw_images"

    image_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration_requests.request_id"),
        nullable=False,
        unique=True,
    )
    image_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    request: Mapped[RegistrationRequest] = relationship(
        back_populates="raw_image",
    )
