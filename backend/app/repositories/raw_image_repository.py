"""
Raw registration image data access (BYTEA split from registration_requests).

System boundary
---------------
Repositories own SQLAlchemy reads/writes only. They do NOT:

- Validate JPEG size / MIME (RegistrationService + schemas)
- Run face detect / embed (face_verification)
- Commit the transaction (service commits after request + image in one unit)

Scalability rule (from database-schema.md)
------------------------------------------
- One row per registration_requests.request_id (UNIQUE FK).
- Admin list/history queries MUST NOT join this table — load by request_id only
  when an operator opens a single registration (VIEW_IMAGE / approve flow).
- Retention: on REJECT, AdminReviewService deletes that request's raw_images
  row (biometric purge). Text history stays on registration_requests + audit_log.
  Approved requests keep their image for enrollment provenance.

Path A (POST /register) uses create_for_request immediately after create_pending.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models.raw_image import RawImage


def get_by_request_id(db: Session, request_id: uuid.UUID) -> RawImage | None:
    """
    Load image bytes for one registration request (point lookup only).

    Do not use in plant-wide list queries — keeps list endpoints lightweight
    at 25k employees / high request volume.
    """
    stmt = (
        select(RawImage)
        .where(RawImage.request_id == request_id)
        .limit(1)
    )
    return db.scalars(stmt).first()


def create_for_request(
    db: Session,
    *,
    request_id: uuid.UUID,
    image_data: bytes,
) -> RawImage:
    """
    Insert raw_images row linked 1:1 to an existing registration_requests row.

    Caller must have flushed registration_requests first so request_id exists.
    Does not commit — service calls db.commit() after the full register transaction.
    """
    row = RawImage(
        request_id=request_id,
        image_data=image_data,
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


def delete_for_request(db: Session, request_id: uuid.UUID) -> bool:
    """Hard-delete the raw_images row for one registration request only.

    Used on REJECT so biometric bytes are not retained after a denial.
    Registration request + audit text history stay. Returns True if a row
    was removed. Does not commit — caller owns the transaction.
    """
    row = get_by_request_id(db, request_id)
    if row is None:
        return False
    db.delete(row)
    db.flush()
    return True


__all__ = [
    "create_for_request",
    "delete_for_request",
    "get_by_request_id",
]
