"""Admin plant catalog HTTP routes — create / list / update / soft-deactivate.

System boundary
---------------
Thin HTTP edge for ``PlantCatalogService``. Public kiosk picker stays on
``GET /plants`` (``plants.py``) — active only, no admin session.

  GET   /admin/plants              — full catalog (incl. inactive)
  POST  /admin/plants              — create
  PATCH /admin/plants/{plantId}    — rename / code change / soft-deactivate

Authz is permission-based (``PLANTS_MANAGE``) inside the service — not
``role == SUPER_ADMIN`` at the route layer. Session dependency is shared with
the rest of the Admin Portal (``X-Admin-Session-Token``).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.routes.admin import get_admin_session
from app.database.session import get_db
from app.schemas.admin import AdminErrorResponse
from app.schemas.plants import (
    AdminPlantListResponse,
    PlantCreateRequest,
    PlantMutationResponse,
    PlantUpdateRequest,
)
from app.services.admin_auth import AdminSession
from app.services.plant_catalog import get_shared_plant_catalog_service

router = APIRouter(prefix="/admin", tags=["admin-plants"])


@router.get(
    "/plants",
    response_model=AdminPlantListResponse,
    responses={
        401: {"model": AdminErrorResponse},
        403: {"model": AdminErrorResponse},
    },
)
def list_admin_plants(
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
    limit: int = Query(15, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> AdminPlantListResponse:
    return get_shared_plant_catalog_service().list_catalog(
        db,
        session,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/plants",
    response_model=PlantMutationResponse,
    responses={
        401: {"model": AdminErrorResponse},
        403: {"model": AdminErrorResponse},
        409: {"model": AdminErrorResponse},
    },
)
def create_admin_plant(
    body: PlantCreateRequest,
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
) -> PlantMutationResponse:
    return get_shared_plant_catalog_service().create_plant(db, session, body)


@router.patch(
    "/plants/{plant_id}",
    response_model=PlantMutationResponse,
    responses={
        401: {"model": AdminErrorResponse},
        403: {"model": AdminErrorResponse},
        404: {"model": AdminErrorResponse},
        409: {"model": AdminErrorResponse},
    },
)
def update_admin_plant(
    plant_id: uuid.UUID,
    body: PlantUpdateRequest,
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
) -> PlantMutationResponse:
    return get_shared_plant_catalog_service().update_plant(
        db,
        session,
        plant_id,
        body,
    )


__all__ = ["router"]
