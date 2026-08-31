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
    MISSING_DECISION_REASON = "MISSING_DECISION_REASON"


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
    plant_id: UUID | None = Field(default=None, validation_alias="plantId")
    password: str


class AdminGrantResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    employee_id: str = Field(..., serialization_alias="employeeId")
    role: str
    plant_id: UUID | None = Field(default=None, serialization_alias="plantId")
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
