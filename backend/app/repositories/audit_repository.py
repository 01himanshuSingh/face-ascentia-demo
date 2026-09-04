"""Audit log data access — append-only writes + plant-scoped keyset reads.

System boundary
---------------
Repository owns SQLAlchemy insert/select for ``audit_log`` only. It does NOT:

- Authorize who may view the timeline (``AUDIT_VIEW`` + plant scope in service)
- Map portal categories → action sets (audit service)
- Encode/decode opaque cursors (audit service)
- Cap date ranges (audit service — max 31 days)
- Commit the transaction (caller commits after domain work + audit)
- Load or return face images (never — not in this table)

Write contract
--------------
``create_entry`` — review / grant / revoke / plant_catalog / kiosk_admin
after domain flush. ``plant_id`` required. ``action`` = ``AuditAction`` value.

Read contract
-------------
``list_for_plant`` — newest-first page for one workspace:

  WHERE plant_id = ?
    AND created_at >= from_time AND created_at < to_time
    AND action IN (...)
    AND (optional actor_id / target_id ILIKE)
    AND (created_at, log_id) < cursor   -- keyset, not OFFSET
  ORDER BY created_at DESC, log_id DESC
  LIMIT n

Uses ``idx_audit_plant_time (plant_id, created_at)``. Caller requests
``limit + 1`` when it needs a ``nextCursor`` signal.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import or_, select, tuple_
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
    """Insert one audit row. Caller owns commit. Never updates existing rows."""
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


def list_for_plant(
    db: Session,
    plant_id: uuid.UUID,
    *,
    actions: frozenset[str],
    from_time: datetime,
    to_time: datetime,
    q: str | None = None,
    limit: int = 50,
    cursor_created_at: datetime | None = None,
    cursor_log_id: uuid.UUID | None = None,
) -> list[AuditLog]:
    """Newest-first keyset page for one plant (no images, no total count)."""
    if not actions:
        return []

    safe_limit = max(1, min(limit, 101))

    stmt = (
        select(AuditLog)
        .where(
            AuditLog.plant_id == plant_id,
            AuditLog.created_at >= from_time,
            AuditLog.created_at < to_time,
            AuditLog.action.in_(actions),
        )
        .order_by(AuditLog.created_at.desc(), AuditLog.log_id.desc())
        .limit(safe_limit)
    )

    if cursor_created_at is not None and cursor_log_id is not None:
        # Strictly older than the last row the client already has.
        stmt = stmt.where(
            tuple_(AuditLog.created_at, AuditLog.log_id)
            < (cursor_created_at, cursor_log_id)
        )

    normalized_q = (q or "").strip()
    if normalized_q:
        pattern = f"%{normalized_q}%"
        stmt = stmt.where(
            or_(
                AuditLog.actor_id.ilike(pattern),
                AuditLog.target_id.ilike(pattern),
            )
        )

    return list(db.scalars(stmt).all())


__all__ = ["create_entry", "list_for_plant"]
