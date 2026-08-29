"""Plant list contracts for kiosk plant picker."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PlantListItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    plant_id: UUID = Field(..., serialization_alias="plantId")
    plant_code: str = Field(..., serialization_alias="plantCode")
    plant_name: str = Field(..., serialization_alias="plantName")


class PlantListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    plants: list[PlantListItem]
