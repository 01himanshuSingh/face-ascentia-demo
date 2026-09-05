"""Admin employee lifecycle HTTP routes — Active/Left roster + soft revoke.

System boundary
---------------
Thin HTTP edge for ``EmployeeLifecycleService``.

  GET  /admin/employees?plantId=&status=active|inactive&q=
  POST /admin/employees/{employeeId}/revoke

Authz: EMPLOYEE_REVOKE + plant scope inside the service.
Never hard-deletes employees.
"""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.routes.admin import get_admin_session
from app.database.session import get_db
from app.schemas.admin import AdminErrorResponse
from app.schemas.employees import (
    AdminEmployeeListResponse,
    EmployeeRevokeRequest,
    EmployeeRevokeResponse,
)
from app.services.admin_auth import AdminSession
from app.services.employee_lifecycle import get_shared_employee_lifecycle_service

router = APIRouter(prefix="/admin", tags=["admin-employees"])


@router.get(
    "/employees",
    response_model=AdminEmployeeListResponse,
    responses={
        401: {"model": AdminErrorResponse},
        403: {"model": AdminErrorResponse},
        404: {"model": AdminErrorResponse},
    },
)
def list_employees(
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
    plant_id: uuid.UUID = Query(..., alias="plantId"),
    status: Literal["active", "inactive"] = Query("active"),
    q: str | None = Query(None),
    limit: int = Query(15, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> AdminEmployeeListResponse:
    """Active enrolled workers, or Left (INACTIVE) history roster."""
    return get_shared_employee_lifecycle_service().list_employees(
        db,
        session,
        plant_id=plant_id,
        status=status,
        q=q,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/employees/{employee_id}/revoke",
    response_model=EmployeeRevokeResponse,
    responses={
        400: {"model": AdminErrorResponse},
        401: {"model": AdminErrorResponse},
        403: {"model": AdminErrorResponse},
        404: {"model": AdminErrorResponse},
        409: {"model": AdminErrorResponse},
    },
)
def revoke_employee(
    employee_id: str,
    body: EmployeeRevokeRequest,
    db: Session = Depends(get_db),
    session: AdminSession = Depends(get_admin_session),
) -> EmployeeRevokeResponse:
    """Soft-revoke worker: INACTIVE + enrollment REVOKED + auto-ungrant."""
    return get_shared_employee_lifecycle_service().revoke_employee(
        db,
        session,
        employee_id=employee_id,
        plant_id=body.plant_id,
        reason=body.reason,
    )


__all__ = ["router"]
