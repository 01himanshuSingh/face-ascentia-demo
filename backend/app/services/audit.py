"""Audit log read service — plant-scoped portal timeline (v1).

System boundary
---------------
Read-only. Writers stay in review / grant / revoke / plant_catalog /
kiosk_admin via ``audit_repository.create_entry``.

  GET /admin/audit → list_logs
    Authz: AUDIT_VIEW + assert_can_manage_plant(plant_id)
    Data:  audit_repository.list_for_plant (keyset)
    No images. No mutations.

Category → actions (default feed — not every click)
----------------------------------------------------
  approved      → APPROVE
  rejected      → REJECT
  admins        → ADMIN_GRANT, REVOKE
  kiosk         → ADMIN_KIOSK_ENROLL
  plants        → PLANT_CREATE, PLANT_UPDATE, PLANT_DEACTIVATE
  employees     → EMPLOYEE_REVOKE  (UI: “Revoked employees”)
  all           → union of the above

VIEW_IMAGE / LOGIN stay in DB but are excluded from default ``all``.

Time window
-----------
Default last 7 days. Max 31 days. Always applied before SQL so the plant+time
index cannot be asked to scan forever.

Cursor
------
Opaque base64 of ``created_at|log_id``. Service encodes/decodes; repository
only sees typed cursor fields.
"""

from __future__ import annotations

import base64
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.common.enums import AdminPermissionCode, AuditAction
from app.common.exceptions import AdminError
from app.repositories import audit_repository
from app.schemas.admin import AdminErrorCode
from app.schemas.audit import AuditCategory, AuditLogItem, AuditLogListResponse
from app.services.admin_auth import AdminSession
from app.services.admin_rbac import assert_can_manage_plant, assert_permission

logger = logging.getLogger(__name__)

_CATEGORY_ACTIONS: dict[AuditCategory, frozenset[str]] = {
    AuditCategory.APPROVED: frozenset({AuditAction.APPROVE.value}),
    AuditCategory.REJECTED: frozenset({AuditAction.REJECT.value}),
    AuditCategory.ADMINS: frozenset(
        {AuditAction.ADMIN_GRANT.value, AuditAction.REVOKE.value}
    ),
    AuditCategory.KIOSK: frozenset({AuditAction.ADMIN_KIOSK_ENROLL.value}),
    AuditCategory.PLANTS: frozenset(
        {
            AuditAction.PLANT_CREATE.value,
            AuditAction.PLANT_UPDATE.value,
            AuditAction.PLANT_DEACTIVATE.value,
        }
    ),
    AuditCategory.EMPLOYEES: frozenset({AuditAction.EMPLOYEE_REVOKE.value}),
}

_DEFAULT_FEED_ACTIONS: frozenset[str] = frozenset().union(*_CATEGORY_ACTIONS.values())

_MAX_RANGE = timedelta(days=31)
_DEFAULT_RANGE = timedelta(days=7)


def _actions_for_category(category: AuditCategory) -> frozenset[str]:
    if category == AuditCategory.ALL:
        return _DEFAULT_FEED_ACTIONS
    return _CATEGORY_ACTIONS[category]


def _encode_cursor(created_at: datetime, log_id: uuid.UUID) -> str:
    raw = f"{created_at.isoformat()}|{log_id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        ts_part, id_part = raw.split("|", 1)
        return datetime.fromisoformat(ts_part), uuid.UUID(id_part)
    except Exception as exc:
        raise AdminError(
            "Invalid audit cursor.",
            code=AdminErrorCode.INVALID_CREDENTIALS,
            http_status=400,
        ) from exc


def _resolve_time_window(
    from_time: datetime | None,
    to_time: datetime | None,
) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    end = to_time or now
    start = from_time or (end - _DEFAULT_RANGE)

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


class AuditLogService:
    """Read-only audit timeline for Admin Portal."""

    def list_logs(
        self,
        db: Session,
        session: AdminSession,
        *,
        plant_id: uuid.UUID,
        category: AuditCategory = AuditCategory.ALL,
        q: str | None = None,
        limit: int = 15,
        offset: int = 0,
        cursor: str | None = None,
        from_time: datetime | None = None,
        to_time: datetime | None = None,
    ) -> AuditLogListResponse:
        assert_permission(session, AdminPermissionCode.AUDIT_VIEW)
        assert_can_manage_plant(session, plant_id)

        start, end = _resolve_time_window(from_time, to_time)
        actions = _actions_for_category(category)
        safe_limit = max(1, min(limit, 100))
        safe_offset = max(0, offset)

        # Portal uses offset pages. Cursor kept for older clients.
        use_offset = cursor is None

        if use_offset:
            rows = audit_repository.list_for_plant(
                db,
                plant_id,
                actions=actions,
                q=q,
                from_time=start,
                to_time=end,
                limit=safe_limit,
                offset=safe_offset,
            )
            total = audit_repository.count_for_plant(
                db,
                plant_id,
                actions=actions,
                q=q,
                from_time=start,
                to_time=end,
            )
            items = [
                AuditLogItem(
                    log_id=row.log_id,
                    created_at=row.created_at,
                    actor_id=row.actor_id,
                    actor_role=row.actor_role,
                    action=row.action,
                    target_type=row.target_type,
                    target_id=row.target_id,
                    plant_id=row.plant_id,
                    metadata=row.metadata_json,
                )
                for row in rows
            ]
            return AuditLogListResponse(
                items=items,
                plant_id=plant_id,
                total=total,
                limit=safe_limit,
                offset=safe_offset,
                next_cursor=None,
            )

        cursor_created_at, cursor_log_id = _decode_cursor(cursor)
        rows = audit_repository.list_for_plant(
            db,
            plant_id,
            actions=actions,
            q=q,
            from_time=start,
            to_time=end,
            limit=safe_limit + 1,
            cursor_created_at=cursor_created_at,
            cursor_log_id=cursor_log_id,
        )

        has_more = len(rows) > safe_limit
        page = rows[:safe_limit]
        next_cursor = None
        if has_more and page:
            last = page[-1]
            next_cursor = _encode_cursor(last.created_at, last.log_id)

        items = [
            AuditLogItem(
                log_id=row.log_id,
                created_at=row.created_at,
                actor_id=row.actor_id,
                actor_role=row.actor_role,
                action=row.action,
                target_type=row.target_type,
                target_id=row.target_id,
                plant_id=row.plant_id,
                metadata=row.metadata_json,
            )
            for row in page
        ]

        return AuditLogListResponse(
            items=items,
            plant_id=plant_id,
            total=0,
            limit=safe_limit,
            offset=0,
            next_cursor=next_cursor,
        )


def get_shared_audit_log_service() -> AuditLogService:
    return AuditLogService()


__all__ = ["AuditLogService", "get_shared_audit_log_service"]
