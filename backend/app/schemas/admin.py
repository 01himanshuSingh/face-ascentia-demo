"""Admin Portal API contracts — plant-scoped registration review."""

from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.common.enums import RegistrationSource, RegistrationStatus


class AdminErrorCode(StrEnum):
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    ADMIN_INACTIVE = "ADMIN_INACTIVE"
    SESSION_EXPIRED = "SESSION_EXPIRED"
    UNAUTHORIZED = "UNAUTHORIZED"
    REQUEST_NOT_FOUND = "REQUEST_NOT_FOUND"
    REQUEST_NOT_PENDING = "REQUEST_NOT_PENDING"
    PLANT_ACCESS_DENIED = "PLANT_ACCESS_DENIED"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    EMPLOYEE_NOT_FOUND = "EMPLOYEE_NOT_FOUND"
    ADMIN_ALREADY_EXISTS = "ADMIN_ALREADY_EXISTS"
    ADMIN_NOT_FOUND = "ADMIN_NOT_FOUND"
    MISSING_DECISION_REASON = "MISSING_DECISION_REASON"
    # Plant catalog (PLANTS_MANAGE)
    PLANT_NOT_FOUND = "PLANT_NOT_FOUND"
    PLANT_CODE_EXISTS = "PLANT_CODE_EXISTS"


class AdminErrorResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    detail: str
    code: AdminErrorCode


class AdminLoginRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    employee_id: str = Field(..., validation_alias="employeeId")
    password: str


class AdminLoginResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    admin_session_token: str = Field(..., serialization_alias="adminSessionToken")
    employee_id: str = Field(..., serialization_alias="employeeId")
    role: str
    plant_id: UUID | None = Field(default=None, serialization_alias="plantId")
    expires_at: str = Field(..., serialization_alias="expiresAt")
    # Effective permission codes from admin_role_permissions — portal UI gates
    # tabs/features on these (backend still enforces on every mutating call).
    permissions: list[str] = Field(default_factory=list)


class RegistrationQueueItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    request_id: UUID = Field(..., serialization_alias="requestId")
    employee_id: str = Field(..., serialization_alias="employeeId")
    submitted_full_name: str = Field(..., serialization_alias="submittedFullName")
    plant_id: UUID = Field(..., serialization_alias="plantId")
    plant_code: str | None = Field(default=None, serialization_alias="plantCode")
    plant_name: str | None = Field(default=None, serialization_alias="plantName")
    status: RegistrationStatus
    source: RegistrationSource
    captured_at: str = Field(..., serialization_alias="capturedAt")


class RegistrationQueueResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    items: list[RegistrationQueueItem]


class AdminGrantRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    employee_id: str = Field(..., validation_alias="employeeId")
    role: str = Field(..., description="PLANT_ADMIN or SUB_ADMIN")
    plant_id: UUID | None = Field(
        default=None,
        validation_alias="plantId",
        description=(
            "Deprecated — omit. PLANT_ADMIN plant is always derived from "
            "employees.plant_id (worker-first)."
        ),
    )
    password: str


class AdminGrantPreviewResponse(BaseModel):
    """Resolved grant target — plant comes from employee, not the grant form."""

    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    employee_id: str = Field(..., serialization_alias="employeeId")
    full_name: str = Field(..., serialization_alias="fullName")
    plant_id: UUID = Field(..., serialization_alias="plantId")
    plant_code: str = Field(..., serialization_alias="plantCode")
    plant_name: str = Field(..., serialization_alias="plantName")
    grant_eligible: bool = Field(..., serialization_alias="grantEligible")
    existing_admin_role: str | None = Field(
        default=None,
        serialization_alias="existingAdminRole",
        description="Set when employee already has an active admin_roles row.",
    )


class AdminGrantResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    employee_id: str = Field(..., serialization_alias="employeeId")
    role: str
    plant_id: UUID | None = Field(default=None, serialization_alias="plantId")
    message: str


# ---------------------------------------------------------------------------
# Plant admin roster + revoke (SUPER workspace; scalable for future SUB_ADMIN)
# ---------------------------------------------------------------------------


class AdminUserItem(BaseModel):
    """Active plant-scoped admin row for roster / search."""

    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    employee_id: str = Field(..., serialization_alias="employeeId")
    full_name: str = Field(..., serialization_alias="fullName")
    role: str
    plant_id: UUID = Field(..., serialization_alias="plantId")
    granted_by: str | None = Field(default=None, serialization_alias="grantedBy")
    created_at: str = Field(..., serialization_alias="createdAt")


class AdminUserListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    items: list[AdminUserItem]
    total: int
    plant_id: UUID = Field(..., serialization_alias="plantId")


class AdminRevokeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    plant_id: UUID = Field(
        ...,
        validation_alias="plantId",
        description="Active plant workspace — must match target admin_roles.plant_id.",
    )
    reason: str | None = Field(
        default=None,
        description="Optional ops note (stored in audit metadata).",
    )


class AdminRevokeResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    employee_id: str = Field(..., serialization_alias="employeeId")
    role: str
    plant_id: UUID = Field(..., serialization_alias="plantId")
    message: str


class RegistrationDecisionRequest(BaseModel):
    reason: str | None = Field(
        default=None,
        description="Required for reject; optional note for approve.",
    )


class RegistrationDecisionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    request_id: UUID = Field(..., serialization_alias="requestId")
    employee_id: str = Field(..., serialization_alias="employeeId")
    status: RegistrationStatus
    message: str
