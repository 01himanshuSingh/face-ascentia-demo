"""
Registration request data access (kiosk Path A + future admin review).

System boundary
---------------
Repositories own SQLAlchemy reads/writes only. They do NOT:

- Check employee ACTIVE / enrollment state (RegistrationService)
- Run face detect / embed / duplicate checks (face_verification, duplicate_check)
- Commit the transaction (service calls db.commit() after raw_images insert)

Path A (POST /register) and Path B (POST /kiosk/admin-enroll, later) both run at
a kiosk but do NOT send kiosk_id in the current rollout — column stays NULL.

Path A uses:
  get_pending_by_employee_id  → guard before insert
  create_pending              → PENDING row, flush for request_id

Image bytes are written by raw_image_repository — never stored on this row.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.common.enums import RegistrationSource, RegistrationStatus
from app.database.models.registration_request import RegistrationRequest


def _optional_text(value: str | None) -> str | None:
    """Treat omitted or blank multipart fields as SQL NULL."""
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None

def get_by_id(db: Session, request_id: uuid.UUID) -> RegistrationRequest | None:
    """Load one registration request by primary key (admin approve / audit)."""
    return db.get(RegistrationRequest, request_id)


def get_pending_by_employee_id(
    db: Session,
    employee_id: str,
) -> RegistrationRequest | None:
    """
    Return the PENDING request for an employee, if any.

    Backed by partial unique index idx_one_pending_per_emp — at most one row.
    """
    stmt = (
        select(RegistrationRequest)
        .where(
            RegistrationRequest.employee_id == employee_id,
            RegistrationRequest.status == RegistrationStatus.PENDING.value,
        )
        .limit(1)
    )
    return db.scalars(stmt).first()


def create_admin_kiosk_approved(
    db: Session,
    *,
    employee_id: str,
    plant_id: uuid.UUID,
    submitted_full_name: str,
    reviewed_by: str,
    kiosk_id: str | None = None,
    session_id: str | None = None,
) -> RegistrationRequest:
    """
    Insert an APPROVED ADMIN_KIOSK registration_requests row (Path B).

    Created at capture time — never PENDING. reviewed_by is the admin operator
    employee_id (must exist in employees for FK).
    """
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    row = RegistrationRequest(
        employee_id=employee_id,
        plant_id=plant_id,
        submitted_full_name=submitted_full_name,
        source=RegistrationSource.ADMIN_KIOSK.value,
        status=RegistrationStatus.APPROVED.value,
        kiosk_id=_optional_text(kiosk_id),
        session_id=_optional_text(session_id),
        reviewed_by=reviewed_by,
        reviewed_at=now,
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


def create_pending(
    db: Session,
    *,
    employee_id: str,
    plant_id: uuid.UUID,
    submitted_full_name: str,
    source: RegistrationSource,
    embedding: list[float] | None = None,
    kiosk_id: str | None = None,
    session_id: str | None = None,
) -> RegistrationRequest:
    """
    Insert a PENDING registration_requests row and flush.

    employee_id is the business ID submitted at the kiosk — no employees row required.
    embedding is the SFace vector used for plant-scoped PENDING duplicate checks.
    """
    row = RegistrationRequest(
        employee_id=employee_id,
        plant_id=plant_id,
        submitted_full_name=submitted_full_name,
        source=source.value,
        status=RegistrationStatus.PENDING.value,
        embedding=embedding,
        kiosk_id=_optional_text(kiosk_id),
        session_id=_optional_text(session_id),
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


def list_pending_by_plant(
    db: Session,
    plant_id: uuid.UUID,
    *,
    limit: int = 15,
    offset: int = 0,
) -> list[RegistrationRequest]:
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    stmt = (
        select(RegistrationRequest)
        .where(
            RegistrationRequest.plant_id == plant_id,
            RegistrationRequest.status == RegistrationStatus.PENDING.value,
        )
        .order_by(RegistrationRequest.captured_at.desc())
        .offset(safe_offset)
        .limit(safe_limit)
    )
    return list(db.scalars(stmt).all())


def count_pending_by_plant(db: Session, plant_id: uuid.UUID) -> int:
    stmt = (
        select(func.count())
        .select_from(RegistrationRequest)
        .where(
            RegistrationRequest.plant_id == plant_id,
            RegistrationRequest.status == RegistrationStatus.PENDING.value,
        )
    )
    return int(db.scalar(stmt) or 0)


def list_pending_all(
    db: Session,
    *,
    limit: int = 15,
    offset: int = 0,
) -> list[RegistrationRequest]:
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    stmt = (
        select(RegistrationRequest)
        .where(RegistrationRequest.status == RegistrationStatus.PENDING.value)
        .order_by(RegistrationRequest.plant_id, RegistrationRequest.captured_at.desc())
        .offset(safe_offset)
        .limit(safe_limit)
    )
    return list(db.scalars(stmt).all())


def count_pending_all(db: Session) -> int:
    stmt = (
        select(func.count())
        .select_from(RegistrationRequest)
        .where(RegistrationRequest.status == RegistrationStatus.PENDING.value)
    )
    return int(db.scalar(stmt) or 0)


def mark_reviewed(
    db: Session,
    request: RegistrationRequest,
    *,
    status: RegistrationStatus,
    reviewed_by: str,
    decision_reason: str | None = None,
) -> RegistrationRequest:
    from datetime import datetime, timezone

    request.status = status.value
    request.reviewed_by = reviewed_by
    request.reviewed_at = datetime.now(timezone.utc)
    request.decision_reason = decision_reason
    db.flush()
    db.refresh(request)
    return request


__all__ = [
    "count_pending_all",
    "count_pending_by_plant",
    "create_admin_kiosk_approved",
    "create_pending",
    "get_by_id",
    "get_pending_by_employee_id",
    "list_pending_all",
    "list_pending_by_plant",
    "mark_reviewed",
]
