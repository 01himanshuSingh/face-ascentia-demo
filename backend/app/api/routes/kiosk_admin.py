"""
Kiosk admin HTTP routes (Path B — SDK overlay → Debian backend).

System design
-------------
Thin transport layer only:
  - JSON login / logout
  - Multipart worker enroll (employee_id + full_name + image)
  - Session header on protected routes

Business rules live in KioskAdminService — not here.

Surface separation
----------------
Router prefix `/kiosk` keeps Path B distinct from:
  - `/admin/*`   — Admin Portal desk (queue, grant, approve)
  - `/register`  — Path A employee self-register (PENDING)

SDK (FaceAuthSDK) is the sole client — Mendix never calls these routes directly.

Current rollout omits optional multipart fields (kiosk_id, session_id).
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Header, UploadFile, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.kiosk_admin import (
    KIOSK_ADMIN_ENROLL_EMPLOYEE_ID_FIELD,
    KIOSK_ADMIN_ENROLL_FULL_NAME_FIELD,
    KIOSK_ADMIN_ENROLL_IMAGE_FIELD,
    KIOSK_ADMIN_ENROLL_KIOSK_ID_FIELD,
    KIOSK_ADMIN_ENROLL_SESSION_ID_FIELD,
    KIOSK_ADMIN_PREFIX,
    KIOSK_ADMIN_SESSION_HEADER,
    KioskAdminEnrollResponse,
    KioskAdminErrorResponse,
    KioskAdminLoginRequest,
    KioskAdminLoginResponse,
    KioskAdminLogoutResponse,
)
from app.services.admin_auth import AdminSession, get_shared_admin_auth_service
from app.services.kiosk_admin import (
    KioskAdminService,
    get_shared_kiosk_admin_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix=KIOSK_ADMIN_PREFIX, tags=["kiosk-admin"])


def get_kiosk_admin_service() -> KioskAdminService:
    return get_shared_kiosk_admin_service()


def get_kiosk_admin_session(
    x_admin_session_token: Annotated[
        str | None,
        Header(alias=KIOSK_ADMIN_SESSION_HEADER),
    ] = None,
) -> AdminSession:
    """Validate admin session on every protected kiosk admin call."""
    return get_shared_admin_auth_service().resolve_session(x_admin_session_token)


@router.post(
    "/admin-login",
    response_model=KioskAdminLoginResponse,
    summary="Admin operator login at kiosk (Path B)",
    description=(
        "Authenticate plant admin with employee_id + password (admin_roles). "
        "Returns admin_session_token for enroll/logout. Does not enroll anyone."
    ),
    responses={
        401: {"model": KioskAdminErrorResponse},
    },
)
def kiosk_admin_login(
    body: KioskAdminLoginRequest,
    db: Session = Depends(get_db),
    kiosk_admin_service: KioskAdminService = Depends(get_kiosk_admin_service),
) -> KioskAdminLoginResponse:
    return kiosk_admin_service.login(
        db,
        employee_id=body.employee_id,
        password=body.password,
    )


@router.post(
    "/admin-enroll",
    response_model=KioskAdminEnrollResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Enroll one worker at kiosk (Path B — ACTIVE immediately)",
    description=(
        "Plant admin enrolls a target worker with a fresh face capture. "
        "plant_id is taken from the admin session — never send it in the body. "
        "Creates employees + ACTIVE enrollment + raw_images. "
        "Does NOT grant admin roles."
    ),
    responses={
        400: {"model": KioskAdminErrorResponse},
        401: {"model": KioskAdminErrorResponse},
        403: {"model": KioskAdminErrorResponse},
        409: {"model": KioskAdminErrorResponse},
    },
)
async def kiosk_admin_enroll(
    employee_id: Annotated[str, Form(alias=KIOSK_ADMIN_ENROLL_EMPLOYEE_ID_FIELD)],
    full_name: Annotated[str, Form(alias=KIOSK_ADMIN_ENROLL_FULL_NAME_FIELD)],
    image: Annotated[UploadFile, File(alias=KIOSK_ADMIN_ENROLL_IMAGE_FIELD)],
    kiosk_id: Annotated[
        str | None,
        Form(alias=KIOSK_ADMIN_ENROLL_KIOSK_ID_FIELD),
    ] = None,
    session_id: Annotated[
        str | None,
        Form(alias=KIOSK_ADMIN_ENROLL_SESSION_ID_FIELD),
    ] = None,
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_kiosk_admin_session),
    kiosk_admin_service: KioskAdminService = Depends(get_kiosk_admin_service),
) -> KioskAdminEnrollResponse:
    image_bytes = await image.read()

    logger.debug(
        "POST /kiosk/admin-enroll admin=%s target_employee=%s image_bytes=%s",
        session.employee_id,
        employee_id,
        len(image_bytes),
    )

    return kiosk_admin_service.enroll_employee(
        db,
        session,
        employee_id=employee_id,
        full_name=full_name,
        image_bytes=image_bytes,
        content_type=image.content_type,
        kiosk_id=kiosk_id,
        session_id=session_id,
    )


@router.post(
    "/admin-logout",
    response_model=KioskAdminLogoutResponse,
    summary="End admin kiosk session (Path B)",
    description="Invalidate admin_session_token immediately.",
    responses={
        401: {"model": KioskAdminErrorResponse},
    },
)
def kiosk_admin_logout(
    x_admin_session_token: Annotated[
        str | None,
        Header(alias=KIOSK_ADMIN_SESSION_HEADER),
    ] = None,
    kiosk_admin_service: KioskAdminService = Depends(get_kiosk_admin_service),
) -> KioskAdminLogoutResponse:
    return kiosk_admin_service.logout(x_admin_session_token)


__all__ = ["router", "KIOSK_ADMIN_SESSION_HEADER"]
