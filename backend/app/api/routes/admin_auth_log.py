"""Admin Auth Log HTTP routes — read-only plant-scoped kiosk login attempts.

System boundary
---------------
Thin HTTP edge for ``AuthLogService``. Writes stay in
``AuthenticationService`` → ``audit_repository.create_entry`` (``LOGIN``).

  GET /admin/auth-log
    ?plantId=       required (SUPER workspace lens / PLANT_ADMIN own plant)
    &from= &to=     optional ISO datetimes (service: default today UTC, max 31d)
    &result=        all | SUCCESS | FAILURE
    &reasonCode=    optional AuthLogReasonCode
    &q=             optional employee ID search
    &limit= &offset= pagination

  GET /admin/auth-log/summary
    Same filters → KPI strip (attempts, success/fail, rate %, top failure).

Authz is permission-based (``AUTH_LOG_VIEW`` + plant scope) inside the service —
not ``role == SUPER_ADMIN`` at the route layer. Session dependency is shared
with the rest of the Admin Portal (``X-Admin-Session-Token``) via
``get_admin_session`` from ``admin.py``.

Dedicated sidebar tab — never mixed into ``GET /admin/audit`` category chips.
No POST/PATCH/DELETE. No image payloads.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.routes.admin import get_admin_session
from app.common.enums import AuthLogReasonCode
from app.database.session import get_db
from app.schemas.admin import AdminErrorResponse
from app.schemas.auth_log import (
    AuthLogListResponse,
    AuthLogResultFilter,
    AuthLogSummaryResponse,
)
from app.services.admin_auth import AdminSession
from app.services.auth_log import get_shared_auth_log_service

router = APIRouter(prefix="/admin", tags=["admin-auth-log"])


@router.get(
    "/auth-log",
    response_model=AuthLogListResponse,
    summary="List kiosk authentication attempts",
    responses={
        400: {"model": AdminErrorResponse},
        401: {"model": AdminErrorResponse},
        403: {"model": AdminErrorResponse},
    },
)
def list_auth_logs(
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
    plant_id: uuid.UUID = Query(
        ...,
        alias="plantId",
        description="Active plant workspace (client lens; not rewritten into session).",
    ),
    result: AuthLogResultFilter = Query(
        AuthLogResultFilter.ALL,
        description="Filter by attempt outcome: all | SUCCESS | FAILURE.",
    ),
    reason_code: AuthLogReasonCode | None = Query(
        None,
        alias="reasonCode",
        description="Optional stable technical reason filter.",
    ),
    q: str | None = Query(
        None,
        description="Case-insensitive contains on attempted Employee ID.",
    ),
    limit: int = Query(15, ge=1, le=100),
    offset: int = Query(0, ge=0, description="Row offset for page navigation."),
    from_time: datetime | None = Query(
        None,
        alias="from",
        description="Range start (inclusive). Default: start of today UTC.",
    ),
    to_time: datetime | None = Query(
        None,
        alias="to",
        description="Range end (exclusive upper bound handled in service window).",
    ),
) -> AuthLogListResponse:
    """Plant-workspace Auth Log page (text only; includes matchPercent when scored)."""
    return get_shared_auth_log_service().list_attempts(
        db,
        session,
        plant_id=plant_id,
        result=result,
        reason_code=reason_code,
        q=q,
        limit=limit,
        offset=offset,
        from_time=from_time,
        to_time=to_time,
    )


@router.get(
    "/auth-log/summary",
    response_model=AuthLogSummaryResponse,
    summary="Auth Log KPI summary for the selected filters",
    responses={
        400: {"model": AdminErrorResponse},
        401: {"model": AdminErrorResponse},
        403: {"model": AdminErrorResponse},
    },
)
def summarize_auth_logs(
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
    plant_id: uuid.UUID = Query(
        ...,
        alias="plantId",
        description="Active plant workspace (client lens; not rewritten into session).",
    ),
    result: AuthLogResultFilter = Query(
        AuthLogResultFilter.ALL,
        description="Filter by attempt outcome: all | SUCCESS | FAILURE.",
    ),
    reason_code: AuthLogReasonCode | None = Query(
        None,
        alias="reasonCode",
        description="Optional stable technical reason filter.",
    ),
    q: str | None = Query(
        None,
        description="Case-insensitive contains on attempted Employee ID.",
    ),
    from_time: datetime | None = Query(None, alias="from"),
    to_time: datetime | None = Query(None, alias="to"),
) -> AuthLogSummaryResponse:
    """KPI strip for Auth Log (attempts, success rate, top failure reason)."""
    return get_shared_auth_log_service().summarize_attempts(
        db,
        session,
        plant_id=plant_id,
        result=result,
        reason_code=reason_code,
        q=q,
        from_time=from_time,
        to_time=to_time,
    )


__all__ = ["router"]
