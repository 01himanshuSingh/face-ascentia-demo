"""Admin audit log API contracts — read-only plant-scoped timeline (v1).

Endpoint
--------
  GET /admin/audit
    ?plantId=   required (SUPER workspace lens / PLANT_ADMIN own plant)
    &from= &to= optional ISO datetimes (service caps range, default last 7d)
    &category=  all | approved | rejected | admins | kiosk | plants | employees
    &q=         optional actor_id / target_id search
    &limit=     page size (service caps)
    &cursor=    opaque keyset cursor from previous ``nextCursor``

Authz: ``AUDIT_VIEW`` + plant workspace (service). Append-only — no write DTOs.

Design locks
------------
- One list response shape for all category chips (presets, not separate APIs).
- Approved and rejected are **separate chips** (not one Registrations bucket).
- Revoked employees chip (category ``employees``) = soft-revoke events (``EMPLOYEE_REVOKE``).
- Text / metadata only — no image fields (faces stay on registration image routes).
- Keyset pagination via ``nextCursor`` — not OFFSET / total count in v1.
- ``VIEW_IMAGE`` / ``LOGIN`` are not in default ``all`` feed (service maps category).
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AuditCategory(StrEnum):
    """Portal filter chips → ``action IN (...)`` in the audit service."""

    ALL = "all"
    APPROVED = "approved"
    REJECTED = "rejected"
    ADMINS = "admins"
    KIOSK = "kiosk"
    PLANTS = "plants"
    EMPLOYEES = "employees"


class AuditLogItem(BaseModel):
    """One ``audit_log`` row for the portal timeline (no face bytes)."""

    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    log_id: UUID = Field(..., serialization_alias="logId")
    created_at: datetime = Field(..., serialization_alias="createdAt")
    actor_id: str | None = Field(None, serialization_alias="actorId")
    actor_role: str | None = Field(None, serialization_alias="actorRole")
    action: str = Field(..., description="AuditAction value, e.g. APPROVE")
    target_type: str | None = Field(None, serialization_alias="targetType")
    target_id: str | None = Field(None, serialization_alias="targetId")
    plant_id: UUID = Field(..., serialization_alias="plantId")
    # JSONB extras (reason, granted_role, reactivated, …) — expand in UI later.
    metadata: dict[str, Any] | None = None


class AuditLogListResponse(BaseModel):
    """Page for one plant workspace (offset pagination + optional keyset cursor)."""

    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    items: list[AuditLogItem]
    plant_id: UUID = Field(..., serialization_alias="plantId")
    total: int = 0
    limit: int = 15
    offset: int = 0
    next_cursor: str | None = Field(
        None,
        serialization_alias="nextCursor",
        description="Legacy keyset cursor; null when using offset pages.",
    )


__all__ = [
    "AuditCategory",
    "AuditLogItem",
    "AuditLogListResponse",
]
