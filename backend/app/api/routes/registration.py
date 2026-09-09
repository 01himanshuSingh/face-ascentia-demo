"""Registration HTTP routes (Path A — kiosk employee self-register)."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.registration import (
    REGISTER_EMPLOYEE_ID_FIELD,
    REGISTER_FULL_NAME_FIELD,
    REGISTER_IMAGE_FIELD,
    REGISTER_KIOSK_ID_FIELD,
    REGISTER_PLANT_ID_FIELD,
    REGISTER_SESSION_ID_FIELD,
    RegisterResponse,
    RegistrationErrorResponse,
)
from app.services.registration import (
    RegistrationService,
    get_shared_registration_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["registration"])


def get_registration_service() -> RegistrationService:
    return get_shared_registration_service()


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit employee self-registration (kiosk Path A)",
    description=(
        "Registration-first kiosk intake: Plant + Employee ID + JPEG. "
        "Full name is optional (defaults to Employee ID when omitted). "
        "No pre-existing HR row required. Creates PENDING registration_requests "
        "routed to the selected plant admin queue."
    ),
    responses={
        400: {"model": RegistrationErrorResponse},
        403: {"model": RegistrationErrorResponse},
        404: {"model": RegistrationErrorResponse},
        409: {"model": RegistrationErrorResponse},
    },
)
async def register(
    employee_id: Annotated[str, Form(alias=REGISTER_EMPLOYEE_ID_FIELD)],
    plant_id: Annotated[str, Form(alias=REGISTER_PLANT_ID_FIELD)],
    image: Annotated[UploadFile, File(alias=REGISTER_IMAGE_FIELD)],
    full_name: Annotated[str | None, Form(alias=REGISTER_FULL_NAME_FIELD)] = None,
    kiosk_id: Annotated[str | None, Form(alias=REGISTER_KIOSK_ID_FIELD)] = None,
    session_id: Annotated[str | None, Form(alias=REGISTER_SESSION_ID_FIELD)] = None,
    db: Session = Depends(get_db),
    registration_service: RegistrationService = Depends(get_registration_service),
) -> RegisterResponse:
    image_bytes = await image.read()

    logger.debug(
        "POST /register employee_id=%s plant_id=%s full_name=%s image_bytes=%s",
        employee_id,
        plant_id,
        full_name,
        len(image_bytes),
    )

    return registration_service.register(
        db,
        employee_id=employee_id,
        plant_id=plant_id,
        full_name=full_name or "",
        image_bytes=image_bytes,
        content_type=image.content_type,
        kiosk_id=kiosk_id,
        session_id=session_id,
    )


__all__ = ["router"]
