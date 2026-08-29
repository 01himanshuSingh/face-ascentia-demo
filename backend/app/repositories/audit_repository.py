"""Audit log data access — append-only sensitive-action history."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.database.models.audit_log import AuditLog


def create_entry(
    db: Session,
    *,
    action: str,
    plant_id: uuid.UUID,
    actor_id: str | None = None,
    actor_role: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    row = AuditLog(
        action=action,
        actor_id=actor_id,
        actor_role=actor_role,
        target_type=target_type,
        target_id=target_id,
        plant_id=plant_id,
        metadata_json=metadata,
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


__all__ = ["create_entry"]
