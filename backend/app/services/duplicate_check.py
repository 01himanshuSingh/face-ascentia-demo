"""
Duplicate-face guard (1:N pgvector search at registration / enroll time).

Architecture
------------
  RegistrationService.register(...)     ← future consumer
        ↓
  DuplicateCheckService.assert_no_duplicate_in_plant(...)
        ↓
  PostgreSQL enrollments + idx_enroll_vector (HNSW, vector_cosine_ops)
        ↓
  DuplicateFaceError  OR  pass

System boundary
---------------
- IN:  live SFace embedding + plant_id + registering employee_id
- OUT: silent pass OR DuplicateFaceError (409)

Scalability
-----------
- Search is plant-scoped (workspace boundary) — not global 25k scan in Python.
- ORDER BY embedding <=> query uses HNSW index idx_enroll_vector.
- LIMIT 1 — only nearest ACTIVE neighbor needed for duplicate gate.
- Login (/authenticate) stays 1:1 by employee_id and does NOT call this module.

Does NOT
--------
- Detect / embed faces (face_verification — caller passes live vector)
- Write registration rows (registration_repository)
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.enums import EnrollmentStatus
from app.common.exceptions import DuplicateFaceError
from app.core.config import Settings, get_settings, settings
from app.database.models.enrollment import Enrollment
from app.services.face_verification import LiveFaceEmbedding

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class NearestEnrollmentMatch:
    """Nearest ACTIVE enrollment in a plant by cosine similarity."""

    employee_id: str
    score: float
    threshold: float

    @property
    def is_duplicate(self) -> bool:
        return self.score >= self.threshold


class DuplicateCheckService:
    """
    Plant-scoped 1:N duplicate detection against ACTIVE enrollment templates.

    Uses pgvector cosine distance (<=>) backed by HNSW — separate gate from
    1:1 auth (``face_duplicate_cosine_threshold``, default 0.53).
    """

    def __init__(self, app_settings: Settings | None = None) -> None:
        self._settings = app_settings or settings

    def assert_no_duplicate_in_plant(
        self,
        db: Session,
        *,
        plant_id: uuid.UUID,
        employee_id: str,
        live_embedding: Sequence[float] | LiveFaceEmbedding,
        threshold: float | None = None,
    ) -> None:
        """
        Raise DuplicateFaceError when live face matches another employee's
        ACTIVE enrollment in the same plant at or above the cosine threshold.

        Args:
            plant_id: Workspace from employees.plant_id (plant-scoped search).
            employee_id: Employee being registered — excluded from neighbors.
            live_embedding: SFace vector from face_verification.extract_live_embedding.
            threshold: Cosine gate; defaults to settings.face_duplicate_cosine_threshold.
        """
        gate = (
            threshold
            if threshold is not None
            else self._settings.face_duplicate_cosine_threshold
        )
        nearest = self.find_nearest_active_in_plant(
            db,
            plant_id=plant_id,
            live_embedding=live_embedding,
            exclude_employee_id=employee_id,
            threshold=gate,
        )
        if nearest is None or not nearest.is_duplicate:
            if nearest is not None:
                logger.info(
                    "duplicate_check | plant=%s | candidate=%s | nearest=%s | "
                    "score=%.3f | threshold=%.3f | duplicate=NO",
                    plant_id,
                    employee_id,
                    nearest.employee_id,
                    nearest.score,
                    nearest.threshold,
                )
            else:
                logger.info(
                    "duplicate_check | plant=%s | candidate=%s | nearest=none | duplicate=NO",
                    plant_id,
                    employee_id,
                )
            return

        logger.warning(
            "duplicate_check | plant=%s | candidate=%s | matched=%s | "
            "score=%.3f | threshold=%.3f | duplicate=YES",
            plant_id,
            employee_id,
            nearest.employee_id,
            nearest.score,
            nearest.threshold,
        )
        raise DuplicateFaceError(matched_employee_id=nearest.employee_id)

    def find_nearest_active_in_plant(
        self,
        db: Session,
        *,
        plant_id: uuid.UUID,
        live_embedding: Sequence[float] | LiveFaceEmbedding,
        exclude_employee_id: str | None = None,
        threshold: float | None = None,
    ) -> NearestEnrollmentMatch | None:
        """
        Return the closest ACTIVE enrollment in plant_id, if any row exists.

        Uses pgvector cosine distance; similarity = 1 - distance (L2-normalized SFace).
        """
        gate = (
            threshold
            if threshold is not None
            else self._settings.face_duplicate_cosine_threshold
        )
        query_vector = _coerce_embedding_vector(
            live_embedding,
            expected=self._settings.face_embedding_dimensions,
        )

        distance_expr = Enrollment.embedding.cosine_distance(query_vector)
        similarity_expr = (1 - distance_expr).label("score")

        stmt = (
            select(Enrollment.employee_id, similarity_expr)
            .where(
                Enrollment.plant_id == plant_id,
                Enrollment.status == EnrollmentStatus.ACTIVE.value,
            )
            .order_by(distance_expr)
            .limit(1)
        )
        if exclude_employee_id:
            stmt = stmt.where(Enrollment.employee_id != exclude_employee_id)

        row = db.execute(stmt).first()
        if row is None:
            return None

        matched_employee_id, score = row
        return NearestEnrollmentMatch(
            employee_id=str(matched_employee_id),
            score=float(score),
            threshold=gate,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _coerce_embedding_vector(
    live_embedding: Sequence[float] | LiveFaceEmbedding,
    *,
    expected: int,
) -> list[float]:
    if isinstance(live_embedding, LiveFaceEmbedding):
        values = live_embedding.vector
    else:
        values = live_embedding

    vector = [float(x) for x in values]
    if len(vector) != expected:
        raise ValueError(
            f"Live embedding dimension {len(vector)} != expected {expected}."
        )
    return vector


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def create_duplicate_check_service(
    *,
    app_settings: Settings | None = None,
) -> DuplicateCheckService:
    return DuplicateCheckService(app_settings=app_settings)


_shared_duplicate_check_service: DuplicateCheckService | None = None


def get_shared_duplicate_check_service() -> DuplicateCheckService:
    global _shared_duplicate_check_service
    if _shared_duplicate_check_service is None:
        _shared_duplicate_check_service = create_duplicate_check_service()
    return _shared_duplicate_check_service


__all__ = [
    "DuplicateCheckService",
    "NearestEnrollmentMatch",
    "create_duplicate_check_service",
    "get_shared_duplicate_check_service",
]
