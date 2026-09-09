"""Auth Log read service — plant-scoped kiosk authentication attempts (v1).

System boundary
---------------
Read-only. Writers stay in ``AuthenticationService`` via
``audit_repository.create_entry`` (``action = LOGIN``).

  GET /admin/auth-log           → list_attempts
  GET /admin/auth-log/summary   → summarize_attempts

Authz: ``AUTH_LOG_VIEW`` + ``assert_can_manage_plant(plant_id)``.
Data:  ``auth_log_repository`` (LOGIN + JSONB filters only).
No images. No mutations. Not mixed into compliance Audit chips / ``all``.

Time window
-----------
Default: **today UTC** (00:00 → now) — daily ops lens for plant admins.
Max range: 31 days (same cap as Audit). Always applied before SQL.

Mapping
-------
Repository returns ``AuditLog`` rows. This service projects text fields into
``AuthLogItem`` / ``AuthLogSummaryResponse`` (reasonLabel, matchPercent).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.common.enums import (
    AUTH_LOG_METADATA_MESSAGE_KEY,
    AUTH_LOG_METADATA_REASON_CODE_KEY,
    AUTH_LOG_METADATA_RESULT_KEY,
    AUTH_LOG_METADATA_SCORE_KEY,
    AUTH_LOG_METADATA_THRESHOLD_KEY,
    AdminPermissionCode,
    AuthLogReasonCode,
    AuthLogResult,
)
from app.common.exceptions import AdminError
from app.database.models.audit_log import AuditLog
from app.repositories import auth_log_repository
from app.schemas.admin import AdminErrorCode
from app.schemas.auth_log import (
    AuthLogItem,
    AuthLogListResponse,
    AuthLogResultFilter,
    AuthLogSummaryResponse,
    auth_log_reason_label,
    match_percent_from_score,
)
from app.services.admin_auth import AdminSession
from app.services.admin_rbac import assert_can_manage_plant, assert_permission

logger = logging.getLogger(__name__)

_MAX_RANGE = timedelta(days=31)
_MAX_LIMIT = 100
_DEFAULT_LIMIT = 15


def _resolve_time_window(
    from_time: datetime | None,
    to_time: datetime | None,
) -> tuple[datetime, datetime]:
    """Default today UTC; reject inverted / >31d ranges."""
    now = datetime.now(timezone.utc)
    end = to_time or now
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = from_time or start_of_today

    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    if end < start:
        raise AdminError(
            "from must be before to.",
            code=AdminErrorCode.INVALID_CREDENTIALS,
            http_status=400,
        )
    if end - start > _MAX_RANGE:
        raise AdminError(
            "Date range cannot exceed 31 days.",
            code=AdminErrorCode.INVALID_CREDENTIALS,
            http_status=400,
        )
    return start, end


def _normalize_result_filter(result: AuthLogResultFilter | str | None) -> str | None:
    if result is None:
        return None
    value = result.value if isinstance(result, AuthLogResultFilter) else str(result)
    normalized = value.strip()
    if not normalized or normalized.lower() == AuthLogResultFilter.ALL.value:
        return None
    if normalized not in {
        AuthLogResult.SUCCESS.value,
        AuthLogResult.FAILURE.value,
    }:
        raise AdminError(
            "result must be all, SUCCESS, or FAILURE.",
            code=AdminErrorCode.INVALID_CREDENTIALS,
            http_status=400,
        )
    return normalized


def _normalize_reason_code(reason_code: str | AuthLogReasonCode | None) -> str | None:
    if reason_code is None:
        return None
    raw = (
        reason_code.value
        if isinstance(reason_code, AuthLogReasonCode)
        else str(reason_code).strip()
    )
    if not raw:
        return None
    try:
        return AuthLogReasonCode(raw).value
    except ValueError as exc:
        raise AdminError(
            f"Unknown reasonCode: {raw}",
            code=AdminErrorCode.INVALID_CREDENTIALS,
            http_status=400,
        ) from exc


def _meta_get(meta: dict[str, Any] | None, key: str) -> Any:
    if not meta:
        return None
    return meta.get(key)


def _parse_result(raw: Any) -> AuthLogResult:
    try:
        return AuthLogResult(str(raw))
    except ValueError:
        return AuthLogResult.FAILURE


def _parse_reason(raw: Any) -> AuthLogReasonCode:
    try:
        return AuthLogReasonCode(str(raw))
    except ValueError:
        return AuthLogReasonCode.UNKNOWN


def _parse_optional_float(raw: Any) -> float | None:
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _row_to_item(row: AuditLog) -> AuthLogItem:
    """Project one LOGIN audit row → portal AuthLogItem (text only)."""
    meta = row.metadata_json if isinstance(row.metadata_json, dict) else {}
    result = _parse_result(_meta_get(meta, AUTH_LOG_METADATA_RESULT_KEY))
    reason = _parse_reason(_meta_get(meta, AUTH_LOG_METADATA_REASON_CODE_KEY))
    score = _parse_optional_float(_meta_get(meta, AUTH_LOG_METADATA_SCORE_KEY))
    threshold = _parse_optional_float(
        _meta_get(meta, AUTH_LOG_METADATA_THRESHOLD_KEY)
    )
    message_raw = _meta_get(meta, AUTH_LOG_METADATA_MESSAGE_KEY)
    message = str(message_raw) if message_raw is not None else None
    employee_id = (row.target_id or row.actor_id or "").strip() or "—"

    return AuthLogItem(
        log_id=row.log_id,
        created_at=row.created_at,
        plant_id=row.plant_id,
        employee_id=employee_id,
        result=result,
        reason_code=reason,
        reason_label=auth_log_reason_label(reason),
        match_percent=match_percent_from_score(score),
        score=score,
        threshold=threshold,
        message=message,
    )


class AuthLogService:
    """Read-only Auth Log for Admin Portal (dedicated sidebar tab)."""

    def list_attempts(
        self,
        db: Session,
        session: AdminSession,
        *,
        plant_id: uuid.UUID,
        result: AuthLogResultFilter | str | None = AuthLogResultFilter.ALL,
        reason_code: str | AuthLogReasonCode | None = None,
        q: str | None = None,
        limit: int = _DEFAULT_LIMIT,
        offset: int = 0,
        from_time: datetime | None = None,
        to_time: datetime | None = None,
    ) -> AuthLogListResponse:
        assert_permission(session, AdminPermissionCode.AUTH_LOG_VIEW)
        assert_can_manage_plant(session, plant_id)

        start, end = _resolve_time_window(from_time, to_time)
        result_filter = _normalize_result_filter(result)
        reason_filter = _normalize_reason_code(reason_code)
        safe_limit = max(1, min(limit, _MAX_LIMIT))
        safe_offset = max(0, offset)

        rows = auth_log_repository.list_login_attempts(
            db,
            plant_id,
            from_time=start,
            to_time=end,
            result=result_filter,
            reason_code=reason_filter,
            q=q,
            limit=safe_limit,
            offset=safe_offset,
        )
        total = auth_log_repository.count_login_attempts(
            db,
            plant_id,
            from_time=start,
            to_time=end,
            result=result_filter,
            reason_code=reason_filter,
            q=q,
        )

        return AuthLogListResponse(
            items=[_row_to_item(row) for row in rows],
            plant_id=plant_id,
            total=total,
            limit=safe_limit,
            offset=safe_offset,
        )

    def summarize_attempts(
        self,
        db: Session,
        session: AdminSession,
        *,
        plant_id: uuid.UUID,
        result: AuthLogResultFilter | str | None = AuthLogResultFilter.ALL,
        reason_code: str | AuthLogReasonCode | None = None,
        q: str | None = None,
        from_time: datetime | None = None,
        to_time: datetime | None = None,
    ) -> AuthLogSummaryResponse:
        assert_permission(session, AdminPermissionCode.AUTH_LOG_VIEW)
        assert_can_manage_plant(session, plant_id)

        start, end = _resolve_time_window(from_time, to_time)
        result_filter = _normalize_result_filter(result)
        reason_filter = _normalize_reason_code(reason_code)

        summary = auth_log_repository.summarize_login_attempts(
            db,
            plant_id,
            from_time=start,
            to_time=end,
            result=result_filter,
            reason_code=reason_filter,
            q=q,
        )

        success_rate: float | None = None
        if summary.total_attempts > 0:
            success_rate = round(
                (summary.success_count / summary.total_attempts) * 100.0,
                1,
            )

        top_code: AuthLogReasonCode | None = None
        top_label: str | None = None
        if summary.top_failure_reason_code:
            top_code = _parse_reason(summary.top_failure_reason_code)
            top_label = auth_log_reason_label(top_code)

        return AuthLogSummaryResponse(
            plant_id=plant_id,
            from_time=start,
            to_time=end,
            total_attempts=summary.total_attempts,
            success_count=summary.success_count,
            failure_count=summary.failure_count,
            success_rate_percent=success_rate,
            top_failure_reason_code=top_code,
            top_failure_reason_label=top_label,
        )


def get_shared_auth_log_service() -> AuthLogService:
    return AuthLogService()


__all__ = ["AuthLogService", "get_shared_auth_log_service"]
