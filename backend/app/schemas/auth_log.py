"""Admin Auth Log API contracts — read-only plant-scoped kiosk login attempts.

Endpoints (wired in ``admin_auth_log`` routes — not ``admin_audit``)
--------------------------------------------------------------------
  GET /admin/auth-log
    ?plantId=       required (SUPER workspace lens / PLANT_ADMIN own plant)
    &from= &to=     optional ISO datetimes (service caps range; default today / 7d)
    &result=        all | SUCCESS | FAILURE
    &reasonCode=    optional AuthLogReasonCode filter
    &q=             optional employee ID search (actor_id / target_id)
    &limit= &offset= pagination (same portal pattern as audit)

  GET /admin/auth-log/summary
    Same plant + date + result + reason + q filters → KPI strip only.

Authz: ``AUTH_LOG_VIEW`` + plant workspace (service). Append-only — no write DTOs.
Writes happen in ``AuthenticationService`` (``audit_log.action = LOGIN``).

Design locks
------------
- Dedicated sidebar tab — never an Audit category chip; never in Audit ``all``.
- Text / scalars only — no face image fields.
- ``matchPercent`` is display-ready (0–100) from stored cosine ``score``; raw
  ``score`` / ``threshold`` remain for detail / support.
- Reason codes are stable enums; portal shows ``reasonLabel`` for operators.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.common.enums import AuthLogReasonCode, AuthLogResult


class AuthLogResultFilter(StrEnum):
    """Portal result filter → service WHERE on metadata.result."""

    ALL = "all"
    SUCCESS = AuthLogResult.SUCCESS.value
    FAILURE = AuthLogResult.FAILURE.value


# Operator-facing labels (English v1). Service copies onto each list item.
AUTH_LOG_REASON_LABELS: dict[AuthLogReasonCode, str] = {
    AuthLogReasonCode.MATCH_OK: "Authenticated",
    AuthLogReasonCode.FACE_MISMATCH: "Face did not match",
    AuthLogReasonCode.MISSING_EMPLOYEE_ID: "Employee ID missing",
    AuthLogReasonCode.EMPLOYEE_NOT_FOUND: "Employee not found",
    AuthLogReasonCode.EMPLOYEE_INACTIVE: "Employee inactive",
    AuthLogReasonCode.ENROLLMENT_NOT_FOUND: "No active enrollment",
    AuthLogReasonCode.EMPTY_IMAGE: "Empty image",
    AuthLogReasonCode.INVALID_IMAGE: "Invalid image",
    AuthLogReasonCode.UNSUPPORTED_IMAGE_TYPE: "Unsupported image type",
    AuthLogReasonCode.IMAGE_TOO_LARGE: "Image too large",
    AuthLogReasonCode.NO_FACE: "No face detected",
    AuthLogReasonCode.MULTIPLE_FACES: "Multiple faces detected",
    AuthLogReasonCode.DETECT_FAILED: "Face detection failed",
    AuthLogReasonCode.EMBED_FAILED: "Face embedding failed",
    AuthLogReasonCode.EMBEDDING_DIMENSION_MISMATCH: "Embedding dimension mismatch",
    AuthLogReasonCode.UNKNOWN: "Unknown failure",
}


def auth_log_reason_label(code: str | AuthLogReasonCode | None) -> str:
    """Resolve a stored reason_code string to a portal label."""
    if code is None:
        return AUTH_LOG_REASON_LABELS[AuthLogReasonCode.UNKNOWN]
    try:
        reason = code if isinstance(code, AuthLogReasonCode) else AuthLogReasonCode(code)
    except ValueError:
        return str(code)
    return AUTH_LOG_REASON_LABELS.get(reason, str(reason.value))


def match_percent_from_score(score: float | None) -> int | None:
    """Cosine 0–1 → whole-number percent for Auth Log UI; None when no score."""
    if score is None:
        return None
    return int(round(max(0.0, min(1.0, float(score))) * 100.0))


class AuthLogItem(BaseModel):
    """One LOGIN attempt for the Auth Log table / detail sheet (text only)."""

    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    log_id: UUID = Field(..., serialization_alias="logId")
    created_at: datetime = Field(..., serialization_alias="createdAt")
    plant_id: UUID = Field(..., serialization_alias="plantId")
    employee_id: str = Field(
        ...,
        serialization_alias="employeeId",
        description="Attempted Employee ID (from audit target_id / actor_id).",
    )
    result: AuthLogResult = Field(
        ...,
        description="SUCCESS or FAILURE (Auth Log KPI / badge).",
    )
    reason_code: AuthLogReasonCode = Field(
        ...,
        serialization_alias="reasonCode",
        description="Stable technical status for filters and support.",
    )
    reason_label: str = Field(
        ...,
        serialization_alias="reasonLabel",
        description="Operator-facing label derived from reasonCode.",
    )
    match_percent: int | None = Field(
        None,
        serialization_alias="matchPercent",
        description="0–100 from cosine score when a 1:1 match ran; else null.",
        ge=0,
        le=100,
    )
    score: float | None = Field(
        None,
        description="Raw cosine similarity when computed (support / detail).",
    )
    threshold: float | None = Field(
        None,
        description="Server match gate used for this attempt when scored.",
    )
    message: str | None = Field(
        None,
        description="Short text message stored at write time (no PII images).",
    )


class AuthLogListResponse(BaseModel):
    """Offset page of Auth Log attempts for one plant workspace."""

    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    items: list[AuthLogItem]
    plant_id: UUID = Field(..., serialization_alias="plantId")
    total: int = 0
    limit: int = 15
    offset: int = 0


class AuthLogSummaryResponse(BaseModel):
    """KPI strip for the selected day / range (same filters as the list)."""

    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    plant_id: UUID = Field(..., serialization_alias="plantId")
    from_time: datetime = Field(..., serialization_alias="from")
    to_time: datetime = Field(..., serialization_alias="to")
    total_attempts: int = Field(..., serialization_alias="totalAttempts")
    success_count: int = Field(..., serialization_alias="successCount")
    failure_count: int = Field(..., serialization_alias="failureCount")
    success_rate_percent: float | None = Field(
        None,
        serialization_alias="successRatePercent",
        description="0–100; null when totalAttempts is 0.",
    )
    top_failure_reason_code: AuthLogReasonCode | None = Field(
        None,
        serialization_alias="topFailureReasonCode",
        description="Most common FAILURE reason_code in the window; null if none.",
    )
    top_failure_reason_label: str | None = Field(
        None,
        serialization_alias="topFailureReasonLabel",
    )


__all__ = [
    "AUTH_LOG_REASON_LABELS",
    "AuthLogItem",
    "AuthLogListResponse",
    "AuthLogReasonCode",
    "AuthLogResult",
    "AuthLogResultFilter",
    "AuthLogSummaryResponse",
    "auth_log_reason_label",
    "match_percent_from_score",
]
