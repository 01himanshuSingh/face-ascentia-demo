"""Admin employee lifecycle API contracts — list + soft revoke.

Endpoints
---------
  GET  /admin/employees?plantId=&status=active|inactive&q=
  POST /admin/employees/{employeeId}/revoke

Revoke is soft: employees.INACTIVE + enrollments.REVOKED + auto-ungrant.
Never hard-deletes employee_id. Auth/register block INACTIVE until admin restores.

status=active  → current enrolled workers (revoke candidates)
status=inactive → left / revoked workers (history roster; employee_id kept)
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

EmployeeListStatus = Literal["active", "inactive"]


class AdminEmployeeItem(BaseModel):
    """Worker row for Active or Left roster in the plant workspace."""

    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    employee_id: str = Field(..., serialization_alias="employeeId")
    full_name: str = Field(..., serialization_alias="fullName")
    plant_id: UUID = Field(..., serialization_alias="plantId")
    status: str
    enrolled_at: datetime | None = Field(None, serialization_alias="enrolledAt")
    enrollment_id: UUID | None = Field(None, serialization_alias="enrollmentId")
    revoked_reason: str | None = Field(None, serialization_alias="revokedReason")
    left_at: datetime | None = Field(
        None,
        serialization_alias="leftAt",
        description="When EMPLOYEE_REVOKE was audited (inactive roster).",
    )


class AdminEmployeeListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    items: list[AdminEmployeeItem]
    total: int
    plant_id: UUID = Field(..., serialization_alias="plantId")
    status: EmployeeListStatus
    limit: int = 15
    offset: int = 0


class EmployeeRevokeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    plant_id: UUID = Field(..., validation_alias="plantId")
    reason: str = Field(..., min_length=1, description="Required ops note.")


class EmployeeRevokeResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    employee_id: str = Field(..., serialization_alias="employeeId")
    plant_id: UUID = Field(..., serialization_alias="plantId")
    enrollment_revoked: bool = Field(..., serialization_alias="enrollmentRevoked")
    admin_ungranted: bool = Field(..., serialization_alias="adminUngranted")
    message: str


__all__ = [
    "AdminEmployeeItem",
    "AdminEmployeeListResponse",
    "EmployeeListStatus",
    "EmployeeRevokeRequest",
    "EmployeeRevokeResponse",
]
