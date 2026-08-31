"""Permission catalog for admin RBAC."""

from __future__ import annotations

from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class AdminPermission(Base):
    """Stable permission codes assigned to admin_roles rows."""

    __tablename__ = "admin_permissions"

    permission_code: Mapped[str] = mapped_column(Text, primary_key=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
