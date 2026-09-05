"""Audit log data access — append-only writes + plant-scoped list reads.

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
``list_for_plant`` — newest-first page for one workspace (keyset and/or offset).
``count_for_plant`` — total matching rows in the same filter window.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, or_, select, tuple_
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


def _base_filters(
    plant_id: uuid.UUID,
    *,
    actions: frozenset[str],
    from_time: datetime,
    to_time: datetime,
    q: str | None,
):
    filters = [
        AuditLog.plant_id == plant_id,
        AuditLog.created_at >= from_time,
        AuditLog.created_at < to_time,
        AuditLog.action.in_(actions),
    ]
    normalized_q = (q or "").strip()
    if normalized_q:
        pattern = f"%{normalized_q}%"
        filters.append(
            or_(
                AuditLog.actor_id.ilike(pattern),
                AuditLog.target_id.ilike(pattern),
            )
        )
    return filters


def list_for_plant(
    db: Session,
    plant_id: uuid.UUID,
    *,
    actions: frozenset[str],
    from_time: datetime,
    to_time: datetime,
    q: str | None = None,
    limit: int = 50,
    offset: int | None = None,
    cursor_created_at: datetime | None = None,
    cursor_log_id: uuid.UUID | None = None,
) -> list[AuditLog]:
    """Newest-first page for one plant (no images)."""
    if not actions:
        return []

    safe_limit = max(1, min(limit, 101))
    filters = _base_filters(
        plant_id,
        actions=actions,
        from_time=from_time,
        to_time=to_time,
        q=q,
    )

    stmt = (
        select(AuditLog)
        .where(*filters)
        .order_by(AuditLog.created_at.desc(), AuditLog.log_id.desc())
        .limit(safe_limit)
    )

    if offset is not None:
        stmt = stmt.offset(max(0, offset))
    elif cursor_created_at is not None and cursor_log_id is not None:
        stmt = stmt.where(
            tuple_(AuditLog.created_at, AuditLog.log_id)
            < (cursor_created_at, cursor_log_id)
        )

    return list(db.scalars(stmt).all())


def count_for_plant(
    db: Session,
    plant_id: uuid.UUID,
    *,
    actions: frozenset[str],
    from_time: datetime,
    to_time: datetime,
    q: str | None = None,
) -> int:
    """Count matching audit rows for offset pagination totals."""
    if not actions:
        return 0
    filters = _base_filters(
        plant_id,
        actions=actions,
        from_time=from_time,
        to_time=to_time,
        q=q,
    )
    stmt = select(func.count()).select_from(AuditLog).where(*filters)
    return int(db.scalar(stmt) or 0)


__all__ = ["count_for_plant", "create_entry", "list_for_plant"]
