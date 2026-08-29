"""Public plant list for kiosk Register UI plant picker."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.repositories import plant_repository
from app.schemas.plants import PlantListItem, PlantListResponse

router = APIRouter(tags=["plants"])


@router.get("/plants", response_model=PlantListResponse)
def list_active_plants(db: Session = Depends(get_db)) -> PlantListResponse:
    plants = plant_repository.list_active(db)
    return PlantListResponse(
        plants=[
            PlantListItem(
                plant_id=plant.plant_id,
                plant_code=plant.plant_code,
                plant_name=plant.plant_name,
            )
            for plant in plants
        ]
    )


__all__ = ["router"]
