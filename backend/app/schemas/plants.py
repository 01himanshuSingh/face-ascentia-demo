"""Plant API contracts — kiosk picker + admin plant catalog CRUD.

Layers
------
  GET  /plants              — public active list (kiosk Path A register)
  GET  /admin/plants         — catalog (incl. inactive); needs PLANTS_MANAGE
  POST /admin/plants         — create; needs PLANTS_MANAGE
  PATCH /admin/plants/{id}   — update name/code or soft-deactivate

Soft-deactivate only (is_active=false). Hard delete is out of scope while
employees / enrollments / registrations reference the plant.

Permission PLANTS_MANAGE is role-agnostic — v1 defaults map it to SUPER_ADMIN;
future roles can receive it via admin_role_permissions.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Shared / kiosk (GET /plants — active only)
# ---------------------------------------------------------------------------


class PlantListItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    plant_id: UUID = Field(..., serialization_alias="plantId")
    plant_code: str = Field(..., serialization_alias="plantCode")
    plant_name: str = Field(..., serialization_alias="plantName")


class PlantListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    plants: list[PlantListItem]


# ---------------------------------------------------------------------------
# Admin catalog (GET/POST/PATCH /admin/plants)
# ---------------------------------------------------------------------------


class AdminPlantItem(BaseModel):
    """Full plant row for admin catalog (includes lifecycle flags)."""

    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    plant_id: UUID = Field(..., serialization_alias="plantId")
    plant_code: str = Field(..., serialization_alias="plantCode")
    plant_name: str = Field(..., serialization_alias="plantName")
    is_active: bool = Field(..., serialization_alias="isActive")
    created_at: datetime = Field(..., serialization_alias="createdAt")


class AdminPlantListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    plants: list[AdminPlantItem]


class PlantCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    plant_code: str = Field(
        ...,
        validation_alias="plantCode",
        min_length=1,
        max_length=64,
        description="Unique short code (e.g. DEV01). Stored uppercase.",
    )
    plant_name: str = Field(
        ...,
        validation_alias="plantName",
        min_length=1,
        max_length=200,
    )

    @field_validator("plant_code")
    @classmethod
    def normalize_plant_code(cls, value: str) -> str:
        normalized = (value or "").strip().upper()
        if not normalized:
            raise ValueError("plantCode is required.")
        return normalized

    @field_validator("plant_name")
    @classmethod
    def normalize_plant_name(cls, value: str) -> str:
        normalized = (value or "").strip()
        if not normalized:
            raise ValueError("plantName is required.")
        return normalized


class PlantUpdateRequest(BaseModel):
    """Partial update — omit fields you do not change.

    Set isActive=false to soft-deactivate (preferred over hard delete).
    """

    model_config = ConfigDict(populate_by_name=True)

    plant_code: str | None = Field(
        default=None,
        validation_alias="plantCode",
        max_length=64,
    )
    plant_name: str | None = Field(
        default=None,
        validation_alias="plantName",
        max_length=200,
    )
    is_active: bool | None = Field(
        default=None,
        validation_alias="isActive",
        description="false = soft-deactivate plant workspace.",
    )

    @field_validator("plant_code")
    @classmethod
    def normalize_optional_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("plantCode cannot be blank.")
        return normalized

    @field_validator("plant_name")
    @classmethod
    def normalize_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("plantName cannot be blank.")
        return normalized


class PlantMutationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    plant: AdminPlantItem
    message: str
