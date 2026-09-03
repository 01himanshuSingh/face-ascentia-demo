"""Plant catalog management — create / update / soft-deactivate.

System boundary
---------------
Owns plant-catalog **policy** for Admin Portal ``/admin/plants``. Does NOT own
the public kiosk picker (``GET /plants`` → ``plant_repository.list_active``).

Layering
--------
  routes (admin)  →  PlantCatalogService  →  plant_repository + audit_repository
                      │
                      ├─ assert_permission(PLANTS_MANAGE)  — role-agnostic
                      ├─ plant workspace scope (session.plant_id)
                      ├─ unique plant_code
                      ├─ soft-deactivate only (never hard-delete)
                      └─ audit_log (PLANT_CREATE / UPDATE / DEACTIVATE)

Scope policy (workspace boundary)
---------------------------------
  Global admin (session.plant_id is None, typically SUPER):
    create new plants · list all · update any · soft-deactivate / reactivate

  Plant-scoped admin (session.plant_id set, e.g. PLANT_ADMIN with PLANTS_MANAGE):
    read / update **own plant only** (name/code)
    cannot create another workspace
    cannot soft-deactivate / reactivate (lifecycle stays global)

Invariants
----------
1. Gate on ``PLANTS_MANAGE``, never ``session.role == SUPER_ADMIN``.
2. ``plant_id`` is the workspace key — catalog CRUD does not rewrite
   ``admin_roles.plant_id`` or employee plant assignment.
3. Soft-deactivate keeps dependent FKs; plant drops from kiosk ``GET /plants``.
4. Service commits after audit (same pattern as admin_grant / admin_review).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.common.enums import AdminPermissionCode, AuditAction
from app.common.exceptions import AdminError
from app.database.models.plant import Plant
from app.repositories import audit_repository, plant_repository
from app.schemas.admin import AdminErrorCode
from app.schemas.plants import (
    AdminPlantItem,
    AdminPlantListResponse,
    PlantCreateRequest,
    PlantMutationResponse,
    PlantUpdateRequest,
)
from app.services.admin_auth import AdminSession
from app.services.admin_rbac import assert_can_manage_plant, assert_permission

logger = logging.getLogger(__name__)


def _is_global_catalog_admin(session: AdminSession) -> bool:
    """True when admin is not locked to one plant (may create / deactivate plants)."""
    return session.plant_id is None


def _to_admin_item(plant: Plant) -> AdminPlantItem:
    return AdminPlantItem(
        plant_id=plant.plant_id,
        plant_code=plant.plant_code,
        plant_name=plant.plant_name,
        is_active=plant.is_active,
        created_at=plant.created_at,
    )


def _assert_plant_code_available(
    db: Session,
    plant_code: str,
    *,
    excluding_plant_id: uuid.UUID | None = None,
) -> None:
    """Reject when another plant already owns this unique code."""
    existing = plant_repository.get_by_code(db, plant_code)
    if existing is None:
        return
    if excluding_plant_id is not None and existing.plant_id == excluding_plant_id:
        return
    raise AdminError(
        f"Plant code '{plant_code}' is already in use.",
        code=AdminErrorCode.PLANT_CODE_EXISTS,
        http_status=409,
    )


def _require_plant(db: Session, plant_id: uuid.UUID) -> Plant:
    plant = plant_repository.get_by_id(db, plant_id)
    if plant is None:
        raise AdminError(
            f"Plant '{plant_id}' was not found.",
            code=AdminErrorCode.PLANT_NOT_FOUND,
            http_status=404,
        )
    return plant


def _assert_can_create_workspace(session: AdminSession) -> None:
    """Only global catalog admins may create a new plant workspace."""
    if _is_global_catalog_admin(session):
        return
    raise AdminError(
        "Plant-scoped admins cannot create another plant workspace.",
        code=AdminErrorCode.PLANT_ACCESS_DENIED,
        http_status=403,
    )


def _assert_can_change_lifecycle(session: AdminSession) -> None:
    """Soft-deactivate / reactivate is a global catalog action only."""
    if _is_global_catalog_admin(session):
        return
    raise AdminError(
        "Plant-scoped admins cannot activate or deactivate plants.",
        code=AdminErrorCode.PLANT_ACCESS_DENIED,
        http_status=403,
    )


class PlantCatalogService:
    """Admin plant catalog — permission, plant scope, uniqueness, audit."""

    def list_catalog(
        self,
        db: Session,
        session: AdminSession,
    ) -> AdminPlantListResponse:
        """Catalog view — all plants for global admin; own plant only otherwise."""
        assert_permission(session, AdminPermissionCode.PLANTS_MANAGE)

        if _is_global_catalog_admin(session):
            plants = plant_repository.list_all(db)
        else:
            assert session.plant_id is not None
            own = plant_repository.get_by_id(db, session.plant_id)
            plants = [own] if own is not None else []

        return AdminPlantListResponse(plants=[_to_admin_item(p) for p in plants])

    def create_plant(
        self,
        db: Session,
        session: AdminSession,
        body: PlantCreateRequest,
    ) -> PlantMutationResponse:
        """Create an active plant. Global catalog admin only."""
        assert_permission(session, AdminPermissionCode.PLANTS_MANAGE)
        _assert_can_create_workspace(session)
        _assert_plant_code_available(db, body.plant_code)

        plant = plant_repository.create(
            db,
            plant_code=body.plant_code,
            plant_name=body.plant_name,
            is_active=True,
        )

        audit_repository.create_entry(
            db,
            action=AuditAction.PLANT_CREATE.value,
            actor_id=session.employee_id,
            actor_role=session.role,
            target_type="plant",
            target_id=str(plant.plant_id),
            plant_id=plant.plant_id,
            metadata={
                "plant_code": plant.plant_code,
                "plant_name": plant.plant_name,
            },
        )
        db.commit()

        logger.info(
            "plant_create | plant_id=%s | code=%s | actor=%s",
            plant.plant_id,
            plant.plant_code,
            session.employee_id,
        )
        return PlantMutationResponse(
            plant=_to_admin_item(plant),
            message=f"Plant '{plant.plant_code}' created.",
        )

    def update_plant(
        self,
        db: Session,
        session: AdminSession,
        plant_id: uuid.UUID,
        body: PlantUpdateRequest,
    ) -> PlantMutationResponse:
        """Partial update and/or soft-deactivate / reactivate.

        Plant-scoped admin may change own plant name/code only.
        Soft-deactivate / reactivate requires a global catalog admin.
        """
        assert_permission(session, AdminPermissionCode.PLANTS_MANAGE)
        plant = _require_plant(db, plant_id)
        assert_can_manage_plant(session, plant.plant_id)

        if (
            body.plant_code is None
            and body.plant_name is None
            and body.is_active is None
        ):
            return PlantMutationResponse(
                plant=_to_admin_item(plant),
                message="No changes.",
            )

        if body.is_active is not None and body.is_active != plant.is_active:
            _assert_can_change_lifecycle(session)

        if body.plant_code is not None:
            _assert_plant_code_available(
                db,
                body.plant_code,
                excluding_plant_id=plant.plant_id,
            )

        before = {
            "plant_code": plant.plant_code,
            "plant_name": plant.plant_name,
            "is_active": plant.is_active,
        }
        was_active = plant.is_active
        deactivating = body.is_active is False and was_active
        reactivating = body.is_active is True and not was_active

        plant = plant_repository.update(
            db,
            plant,
            plant_code=body.plant_code,
            plant_name=body.plant_name,
            is_active=body.is_active,
        )

        dependents: dict[str, int] | None = None
        if deactivating:
            dependents = plant_repository.count_dependent_rows(db, plant.plant_id)
            action = AuditAction.PLANT_DEACTIVATE
            message = f"Plant '{plant.plant_code}' deactivated."
        else:
            action = AuditAction.PLANT_UPDATE
            if reactivating:
                message = f"Plant '{plant.plant_code}' reactivated."
            else:
                message = f"Plant '{plant.plant_code}' updated."

        metadata: dict[str, Any] = {
            "before": before,
            "after": {
                "plant_code": plant.plant_code,
                "plant_name": plant.plant_name,
                "is_active": plant.is_active,
            },
        }
        if dependents is not None:
            metadata["dependents"] = dependents

        audit_repository.create_entry(
            db,
            action=action.value,
            actor_id=session.employee_id,
            actor_role=session.role,
            target_type="plant",
            target_id=str(plant.plant_id),
            plant_id=plant.plant_id,
            metadata=metadata,
        )
        db.commit()

        logger.info(
            "plant_%s | plant_id=%s | code=%s | actor=%s | dependents=%s",
            "deactivate" if deactivating else "update",
            plant.plant_id,
            plant.plant_code,
            session.employee_id,
            dependents,
        )
        return PlantMutationResponse(plant=_to_admin_item(plant), message=message)


def get_shared_plant_catalog_service() -> PlantCatalogService:
    return PlantCatalogService()


__all__ = ["PlantCatalogService", "get_shared_plant_catalog_service"]
