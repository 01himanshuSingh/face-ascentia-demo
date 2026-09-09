"""Auth Log data access — plant-scoped LOGIN reads over ``audit_log``.

System boundary
---------------
Repository owns SQLAlchemy **reads** for kiosk authentication attempts only.
It does NOT:

- Authorize (``AUTH_LOG_VIEW`` + plant scope live in ``auth_log`` service)
- Cap date ranges (service)
- Map reason codes → portal labels / matchPercent (service + schemas)
- Write LOGIN rows (``AuthenticationService`` → ``audit_repository.create_entry``)
- Commit / rollback
- Touch face images (never — text metadata only)

Why a separate module (not more filters on ``audit_repository``)
----------------------------------------------------------------
Compliance Audit lists actions by category chip and must **exclude** LOGIN.
Auth Log always filters ``action = LOGIN`` plus JSONB ``result`` / ``reason_code``.
Keeping that SQL here prevents Audit list APIs from accidentally mixing surfaces.

Read contract
-------------
``list_login_attempts`` — newest-first page for one plant.
``count_login_attempts`` — total for offset pagination.
``summarize_login_attempts`` — KPI counts + top failure reason_code.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.common.enums import (
    AUTH_LOG_METADATA_REASON_CODE_KEY,
    AUTH_LOG_METADATA_RESULT_KEY,
    AuditAction,
    AuthLogResult,
)
from app.database.models.audit_log import AuditLog

_LOGIN_ACTION = AuditAction.LOGIN.value
_MAX_PAGE = 100


@dataclass(frozen=True, slots=True)
class AuthLogSummaryRow:
    """Raw aggregate for the Auth Log KPI strip (no labels)."""

    total_attempts: int
    success_count: int
    failure_count: int
    top_failure_reason_code: str | None


def _result_json_path():
    """JSONB → text for metadata.result (AuthLogResult value)."""
    return AuditLog.metadata_json[AUTH_LOG_METADATA_RESULT_KEY].as_string()


def _reason_json_path():
    """JSONB → text for metadata.reason_code (AuthLogReasonCode value)."""
    return AuditLog.metadata_json[AUTH_LOG_METADATA_REASON_CODE_KEY].as_string()


def _base_login_filters(
    plant_id: uuid.UUID,
    *,
    from_time: datetime,
    to_time: datetime,
    result: str | None,
    reason_code: str | None,
    q: str | None,
) -> list:
    """Plant + time + LOGIN + optional metadata / employee search."""
    filters = [
        AuditLog.plant_id == plant_id,
        AuditLog.action == _LOGIN_ACTION,
        AuditLog.created_at >= from_time,
        AuditLog.created_at < to_time,
    ]

    normalized_result = (result or "").strip()
    if normalized_result and normalized_result.lower() != "all":
        filters.append(_result_json_path() == normalized_result)

    normalized_reason = (reason_code or "").strip()
    if normalized_reason:
        filters.append(_reason_json_path() == normalized_reason)

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


def list_login_attempts(
    db: Session,
    plant_id: uuid.UUID,
    *,
    from_time: datetime,
    to_time: datetime,
    result: str | None = None,
    reason_code: str | None = None,
    q: str | None = None,
    limit: int = 15,
    offset: int = 0,
) -> list[AuditLog]:
    """Newest-first LOGIN page for one plant (text rows only)."""
    safe_limit = max(1, min(limit, _MAX_PAGE))
    safe_offset = max(0, offset)
    filters = _base_login_filters(
        plant_id,
        from_time=from_time,
        to_time=to_time,
        result=result,
        reason_code=reason_code,
        q=q,
    )
    stmt = (
        select(AuditLog)
        .where(*filters)
        .order_by(AuditLog.created_at.desc(), AuditLog.log_id.desc())
        .limit(safe_limit)
        .offset(safe_offset)
    )
    return list(db.scalars(stmt).all())


def count_login_attempts(
    db: Session,
    plant_id: uuid.UUID,
    *,
    from_time: datetime,
    to_time: datetime,
    result: str | None = None,
    reason_code: str | None = None,
    q: str | None = None,
) -> int:
    """Count LOGIN rows matching the same filters as the list."""
    filters = _base_login_filters(
        plant_id,
        from_time=from_time,
        to_time=to_time,
        result=result,
        reason_code=reason_code,
        q=q,
    )
    stmt = select(func.count()).select_from(AuditLog).where(*filters)
    return int(db.scalar(stmt) or 0)


def summarize_login_attempts(
    db: Session,
    plant_id: uuid.UUID,
    *,
    from_time: datetime,
    to_time: datetime,
    result: str | None = None,
    reason_code: str | None = None,
    q: str | None = None,
) -> AuthLogSummaryRow:
    """KPI aggregates for the Auth Log strip (same filter window as list)."""
    filters = _base_login_filters(
        plant_id,
        from_time=from_time,
        to_time=to_time,
        result=result,
        reason_code=reason_code,
        q=q,
    )
    result_col = _result_json_path()
    success_value = AuthLogResult.SUCCESS.value
    failure_value = AuthLogResult.FAILURE.value

    totals_stmt = select(
        func.count().label("total"),
        func.count()
        .filter(result_col == success_value)
        .label("success_count"),
        func.count()
        .filter(result_col == failure_value)
        .label("failure_count"),
    ).where(*filters)
    total, success_count, failure_count = db.execute(totals_stmt).one()

    top_failure: str | None = None
    # Top failure reason ignores a SUCCESS-only result filter (nothing to rank).
    if (result or "").strip() != success_value:
        reason_col = _reason_json_path()
        failure_filters = [
            *filters,
            result_col == failure_value,
        ]
        # If caller already filtered to a single reason, that is the "top".
        if (reason_code or "").strip():
            top_failure = reason_code.strip()
        else:
            top_stmt = (
                select(reason_col, func.count().label("n"))
                .where(*failure_filters)
                .group_by(reason_col)
                .order_by(func.count().desc())
                .limit(1)
            )
            top_row = db.execute(top_stmt).first()
            if top_row is not None and top_row[0]:
                top_failure = str(top_row[0])

    return AuthLogSummaryRow(
        total_attempts=int(total or 0),
        success_count=int(success_count or 0),
        failure_count=int(failure_count or 0),
        top_failure_reason_code=top_failure,
    )


__all__ = [
    "AuthLogSummaryRow",
    "count_login_attempts",
    "list_login_attempts",
    "summarize_login_attempts",
]
