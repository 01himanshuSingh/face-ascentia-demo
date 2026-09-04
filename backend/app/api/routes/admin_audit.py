"""Admin audit log HTTP routes — read-only plant-scoped timeline.

System boundary
---------------
Thin HTTP edge for ``AuditLogService``. Writes stay in review / grant /
revoke / plant_catalog / kiosk_admin via ``audit_repository.create_entry``.

  GET /admin/audit
    ?plantId=     required (SUPER workspace lens / PLANT_ADMIN own plant)
    &from= &to=   optional ISO datetimes (service: default 7d, max 31d)
    &category=    all | approved | rejected | admins | kiosk | plants
    &q=           optional actor / target search
    &limit=       page size (capped in service)
    &cursor=      opaque keyset from previous nextCursor

Authz is permission-based (``AUDIT_VIEW`` + plant scope) inside the service —
not ``role == SUPER_ADMIN`` at the route layer. Session dependency is shared
with the rest of the Admin Portal (``X-Admin-Session-Token``) via
``get_admin_session`` from ``admin.py``.

No POST/PATCH/DELETE. No image payloads.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.routes.admin import get_admin_session
from app.database.session import get_db
from app.schemas.admin import AdminErrorResponse
from app.schemas.audit import AuditCategory, AuditLogListResponse
from app.services.admin_auth import AdminSession
from app.services.audit import get_shared_audit_log_service

router = APIRouter(prefix="/admin", tags=["admin-audit"])


@router.get(
    "/audit",
    response_model=AuditLogListResponse,
    responses={
        400: {"model": AdminErrorResponse},
        401: {"model": AdminErrorResponse},
        403: {"model": AdminErrorResponse},
    },
)
def list_audit_logs(
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
    plant_id: uuid.UUID = Query(
        ...,
        alias="plantId",
        description="Active plant workspace (client lens; not rewritten into session).",
    ),
    category: AuditCategory = Query(
        AuditCategory.ALL,
        description="Portal chip preset → action IN (...) in the service.",
    ),
    q: str | None = Query(
        None,
        description="Case-insensitive contains on actor_id or target_id.",
    ),
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = Query(
        None,
        description="Opaque keyset from previous response nextCursor.",
    ),
    from_time: datetime | None = Query(None, alias="from"),
    to_time: datetime | None = Query(None, alias="to"),
) -> AuditLogListResponse:
    """Plant-workspace audit feed (keyset pagination, text/metadata only)."""
    return get_shared_audit_log_service().list_logs(
        db,
        session,
        plant_id=plant_id,
        category=category,
        q=q,
        limit=limit,
        cursor=cursor,
        from_time=from_time,
        to_time=to_time,
    )


__all__ = ["router"]
