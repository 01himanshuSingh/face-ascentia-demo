"""Admin Portal HTTP routes — auth, plant-workspace review, grant, revoke.

Layering
--------
Routes stay thin: session dependency + schema bind → services.
Plant workspace scope and RBAC live in services
(admin_review, admin_grant, admin_users, admin_rbac).

Plant catalog CRUD (``GET/POST/PATCH /admin/plants``) lives in ``admin_plants.py``
so registration-review and plant-catalog stay separate bounded contexts.

Audit timeline (``GET /admin/audit``) lives in ``admin_audit.py`` — read-only,
plant-scoped keyset feed (``AUDIT_VIEW``).

Plant workspace (pending queue + admin roster)
---------------------------------------------
  GET /admin/registrations/pending?plantId=<uuid>
  GET /admin/users?plantId=<uuid>&q=

  Client sends active plant workspace as ``plantId`` (browser sessionStorage /
  query). Does not rewrite admin_roles.plant_id.

Grant / revoke
--------------
  POST /admin/users/grant              — worker-first; plant from employee row
  POST /admin/users/{employeeId}/revoke — soft-ungrant in workspace (v1: SUPER)
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy.orm import Session

from app.common.enums import AdminRoleType
from app.common.exceptions import AdminError
from app.database.session import get_db
from app.schemas.admin import (
    AdminErrorCode,
    AdminErrorResponse,
    AdminGrantPreviewResponse,
    AdminGrantRequest,
    AdminGrantResponse,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminRevokeRequest,
    AdminRevokeResponse,
    AdminUserListResponse,
    RegistrationDecisionRequest,
    RegistrationDecisionResponse,
    RegistrationQueueResponse,
)
from app.services.admin_auth import AdminSession, get_shared_admin_auth_service
from app.services.admin_grant import get_shared_admin_grant_service
from app.services.admin_review import get_shared_admin_review_service
from app.services.admin_users import get_shared_admin_users_service

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_SESSION_HEADER = "X-Admin-Session-Token"


def get_admin_session(
    x_admin_session_token: Annotated[str | None, Header(alias=ADMIN_SESSION_HEADER)] = None,
) -> AdminSession:
    """Resolve opaque admin session from X-Admin-Session-Token."""
    return get_shared_admin_auth_service().resolve_session(x_admin_session_token)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@router.post(
    "/login",
    response_model=AdminLoginResponse,
    responses={401: {"model": AdminErrorResponse}},
)
def admin_login(
    body: AdminLoginRequest,
    db: Session = Depends(get_db),
) -> AdminLoginResponse:
    return get_shared_admin_auth_service().login(
        db,
        employee_id=body.employee_id,
        password=body.password,
    )


# ---------------------------------------------------------------------------
# Grant PLANT_ADMIN (worker-first; plant from employee row)
# ---------------------------------------------------------------------------


@router.get(
    "/users/grant-preview/{employee_id}",
    response_model=AdminGrantPreviewResponse,
    responses={403: {"model": AdminErrorResponse}, 404: {"model": AdminErrorResponse}},
)
def preview_grant_target(
    employee_id: str,
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
) -> AdminGrantPreviewResponse:
    return get_shared_admin_grant_service().preview_grant_target(
        db,
        session,
        employee_id=employee_id,
    )


@router.post(
    "/users/grant",
    response_model=AdminGrantResponse,
    responses={
        403: {"model": AdminErrorResponse},
        404: {"model": AdminErrorResponse},
        409: {"model": AdminErrorResponse},
    },
)
def grant_admin_role(
    body: AdminGrantRequest,
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
) -> AdminGrantResponse:
    try:
        role = AdminRoleType(body.role.strip().upper())
    except ValueError as exc:
        raise AdminError(
            f"Invalid role: {body.role}",
            code=AdminErrorCode.PERMISSION_DENIED,
            http_status=400,
        ) from exc

    return get_shared_admin_grant_service().grant_role(
        db,
        session,
        employee_id=body.employee_id,
        role=role,
        plant_id=body.plant_id,
        password=body.password,
    )


# ---------------------------------------------------------------------------
# Plant admin roster + revoke (workspace plantId; v1 SUPER / global only)
# ---------------------------------------------------------------------------


@router.get(
    "/users",
    response_model=AdminUserListResponse,
    responses={
        401: {"model": AdminErrorResponse},
        403: {"model": AdminErrorResponse},
        404: {"model": AdminErrorResponse},
    },
)
def list_plant_admins(
    plant_id: Annotated[
        uuid.UUID,
        Query(
            alias="plantId",
            description=(
                "Active plant workspace. Returns active PLANT_ADMIN rows for "
                "this plant only (v1: global/SUPER sessions)."
            ),
        ),
    ],
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
    q: Annotated[
        str | None,
        Query(
            description="Optional search on employeeId or full name.",
        ),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AdminUserListResponse:
    return get_shared_admin_users_service().list_plant_admins(
        db,
        session,
        plant_id=plant_id,
        q=q,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/users/{employee_id}/revoke",
    response_model=AdminRevokeResponse,
    responses={
        401: {"model": AdminErrorResponse},
        403: {"model": AdminErrorResponse},
        404: {"model": AdminErrorResponse},
    },
)
def revoke_plant_admin(
    employee_id: str,
    body: AdminRevokeRequest,
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
) -> AdminRevokeResponse:
    """Soft-ungrant plant admin in the given workspace (employee stays a worker)."""
    return get_shared_admin_users_service().revoke_plant_admin(
        db,
        session,
        employee_id=employee_id,
        plant_id=body.plant_id,
        reason=body.reason,
    )


# ---------------------------------------------------------------------------
# Registration review (pending queue = active plant workspace)
# ---------------------------------------------------------------------------


@router.get(
    "/registrations/pending",
    response_model=RegistrationQueueResponse,
    responses={
        401: {"model": AdminErrorResponse},
        403: {"model": AdminErrorResponse},
        404: {"model": AdminErrorResponse},
    },
)
def list_pending_registrations(
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
    plant_id: Annotated[
        uuid.UUID | None,
        Query(
            alias="plantId",
            description=(
                "Active plant workspace. SUPER: filter to this plant "
                "(omit = all plants). PLANT_ADMIN: omit or must equal session plant."
            ),
        ),
    ] = None,
) -> RegistrationQueueResponse:
    return get_shared_admin_review_service().list_pending(
        db,
        session,
        plant_id=plant_id,
    )


@router.get(
    "/registrations/{request_id}/image",
    responses={401: {"model": AdminErrorResponse}, 404: {"model": AdminErrorResponse}},
)
def get_registration_image(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
) -> Response:
    image_bytes = get_shared_admin_review_service().get_image_bytes(
        db,
        session,
        request_id,
    )
    return Response(content=image_bytes, media_type="image/jpeg")


@router.post(
    "/registrations/{request_id}/approve",
    response_model=RegistrationDecisionResponse,
    responses={401: {"model": AdminErrorResponse}, 409: {"model": AdminErrorResponse}},
)
def approve_registration(
    request_id: uuid.UUID,
    body: RegistrationDecisionRequest,
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
) -> RegistrationDecisionResponse:
    return get_shared_admin_review_service().approve(
        db,
        session,
        request_id,
        reason=body.reason,
    )


@router.post(
    "/registrations/{request_id}/reject",
    response_model=RegistrationDecisionResponse,
    responses={401: {"model": AdminErrorResponse}, 400: {"model": AdminErrorResponse}},
)
def reject_registration(
    request_id: uuid.UUID,
    body: RegistrationDecisionRequest,
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
) -> RegistrationDecisionResponse:
    return get_shared_admin_review_service().reject(
        db,
        session,
        request_id,
        reason=body.reason or "",
    )


__all__ = ["router", "ADMIN_SESSION_HEADER", "get_admin_session"]
