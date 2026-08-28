"""
Authentication HTTP routes (Week 1).

Architecture
------------
  Mendix / test-harness / FaceAuthClient
        ↓  multipart POST /authenticate
  auth.py (this module) — HTTP edge only
        ↓
  AuthenticationService.authenticate(...)
        ↓
  AuthenticateResponse (200)  OR  AuthError → main.py handler

Design rules
------------
- Routes bind transport (Form/File) and call the service — no business logic.
- AuthError subclasses bubble up; main.py maps them once to AuthErrorResponse.
- Wrong face is HTTP 200 with authenticated=false (handled in the service).
- Do not import OpenCV / MediaPipe / raw SQLAlchemy queries here.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.auth import (
    AUTHENTICATE_EMPLOYEE_ID_FIELD,
    AUTHENTICATE_IMAGE_FIELD,
    AuthErrorResponse,
    AuthenticateResponse,
)
from app.services.authentication import (
    AuthenticationService,
    get_shared_authentication_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["authentication"])


def get_authentication_service() -> AuthenticationService:
    """FastAPI dependency — shared orchestrator for /authenticate."""
    return get_shared_authentication_service()


@router.post(
    "/authenticate",
    response_model=AuthenticateResponse,
    summary="Authenticate employee by face (1:1)",
    description=(
        "Week 1 kiosk login path. Accepts one Employee ID and one JPEG still "
        "from the Face Auth SDK (blink/liveness already completed client-side). "
        "Returns authenticated=true when live cosine score meets the server threshold."
    ),
    responses={
        400: {
            "model": AuthErrorResponse,
            "description": "Invalid request, image, or face-detection failure.",
        },
        403: {
            "model": AuthErrorResponse,
            "description": "Employee exists but is inactive.",
        },
        404: {
            "model": AuthErrorResponse,
            "description": "Employee or ACTIVE enrollment not found.",
        },
        500: {
            "model": AuthErrorResponse,
            "description": "Unexpected server failure (e.g. embedding dimension mismatch).",
        },
    },
)
async def authenticate(
    employee_id: Annotated[
        str,
        Form(
            ...,
            alias=AUTHENTICATE_EMPLOYEE_ID_FIELD,
            description="Business Employee ID from Mendix.",
        ),
    ],
    image: Annotated[
        UploadFile,
        File(
            ...,
            alias=AUTHENTICATE_IMAGE_FIELD,
            description="Best JPEG frame from SDK burst capture.",
        ),
    ],
    db: Session = Depends(get_db),
    auth_service: AuthenticationService = Depends(get_authentication_service),
) -> AuthenticateResponse:
    """
    POST /authenticate — multipart form: employee_id + image file.

    Transport only; all domain rules live in AuthenticationService.
    """
    image_bytes = await image.read()

    logger.debug(
        "POST /authenticate employee_id=%s image_bytes=%s content_type=%s",
        employee_id,
        len(image_bytes),
        image.content_type,
    )

    return auth_service.authenticate(
        db,
        employee_id=employee_id,
        image_bytes=image_bytes,
        content_type=image.content_type,
    )


__all__ = ["router"]
