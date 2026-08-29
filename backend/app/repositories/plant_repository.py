"""Plant data access — kiosk plant picker and admin workspace scoping."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models.plant import Plant


def get_by_id(db: Session, plant_id: uuid.UUID) -> Plant | None:
    return db.get(Plant, plant_id)


def list_active(db: Session) -> list[Plant]:
    stmt = (
        select(Plant)
        .where(Plant.is_active.is_(True))
        .order_by(Plant.plant_name)
    )
    return list(db.scalars(stmt).all())


__all__ = ["get_by_id", "list_active"]
