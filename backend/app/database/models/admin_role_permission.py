"""Junction: which permissions each admin_roles row has."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

if TYPE_CHECKING:
    from app.database.models.admin_permission import AdminPermission
    from app.database.models.admin_role import AdminRole


class AdminRolePermission(Base):
    __tablename__ = "admin_role_permissions"
    __table_args__ = (
        Index("idx_admin_role_permissions_role_id", "role_id"),
    )

    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("admin_roles.role_id", ondelete="CASCADE"),
        primary_key=True,
    )
    permission_code: Mapped[str] = mapped_column(
        Text,
        ForeignKey("admin_permissions.permission_code", ondelete="CASCADE"),
        primary_key=True,
    )

    admin_role: Mapped["AdminRole"] = relationship(back_populates="permissions")
    permission: Mapped["AdminPermission"] = relationship()
