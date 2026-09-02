"""Admin Portal HTTP routes — login and plant-scoped registration review."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.admin import (
    AdminErrorResponse,
    AdminGrantPreviewResponse,
    AdminGrantRequest,
    AdminGrantResponse,
    AdminLoginRequest,
    AdminLoginResponse,
    RegistrationDecisionRequest,
    RegistrationDecisionResponse,
    RegistrationQueueResponse,
)
from app.services.admin_auth import AdminSession, get_shared_admin_auth_service
from app.services.admin_grant import get_shared_admin_grant_service
from app.services.admin_review import get_shared_admin_review_service

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_SESSION_HEADER = "X-Admin-Session-Token"


def get_admin_session(
    x_admin_session_token: Annotated[str | None, Header(alias=ADMIN_SESSION_HEADER)] = None,
) -> AdminSession:
    return get_shared_admin_auth_service().resolve_session(x_admin_session_token)


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
    responses={403: {"model": AdminErrorResponse}, 404: {"model": AdminErrorResponse}},
)
def grant_admin_role(
    body: AdminGrantRequest,
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
) -> AdminGrantResponse:
    from app.common.enums import AdminRoleType

    try:
        role = AdminRoleType(body.role.strip().upper())
    except ValueError as exc:
        from app.common.exceptions import AdminError
        from app.schemas.admin import AdminErrorCode

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


@router.get(
    "/registrations/pending",
    response_model=RegistrationQueueResponse,
    responses={401: {"model": AdminErrorResponse}, 403: {"model": AdminErrorResponse}},
)
def list_pending_registrations(
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
) -> RegistrationQueueResponse:
    return get_shared_admin_review_service().list_pending(db, session)


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


__all__ = ["router", "ADMIN_SESSION_HEADER"]
