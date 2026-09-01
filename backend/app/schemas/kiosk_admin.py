"""
Kiosk admin API contracts (Path B — plant admin enrolls workers at kiosk).

System design boundary
----------------------
  Mendix → SDK.authenticate(workerEmployeeId)
        ↓  not enrolled
  SDK STATE 3 — [Employee Register] | [Admin Kiosk Login]
        ↓ Admin Kiosk Login (Path B)
  Admin enters **own** employee_id + password (admin_roles — NOT face)
        ↓  POST /kiosk/admin-login
  SDK holds admin_session_token in memory (short-lived kiosk session)
        ↓  repeat per joiner
  Admin enters **target worker** employee_id + **fresh** camera capture
        ↓  POST /kiosk/admin-enroll  (multipart: employee_id + image only)
  Backend → registration_requests APPROVED, source=ADMIN_KIOSK
            employees + enrollments ACTIVE immediately (no Admin Portal queue)

Contrast with other paths (do not merge contracts)
--------------------------------------------------
  POST /register              → Path A; employee self-register; PENDING; plant from form
  POST /admin/login           → Admin Portal desk session (8h TTL); review queue only
  POST /admin/users/grant     → SUPER_ADMIN grants PLANT_ADMIN — never callable from kiosk
  POST /kiosk/admin-enroll    → Path B; worker enroll only; plant from admin session

Non-negotiable rules (enforced in KioskAdminService, documented here)
---------------------------------------------------------------------
1. **Workers only** — enroll creates/updates employees + ACTIVE enrollments.
   Does NOT create admin_roles rows or grant PLANT_ADMIN / SUPER_ADMIN.

2. **plant_id from session** — never accepted from client body on enroll.
   All rows (employee, enrollment, registration_request, audit) use
   session.plant_id from the logged-in PLANT_ADMIN.

3. **v1 kiosk enroll operator** — PLANT_ADMIN with non-null plant_id only.
   SUPER_ADMIN (plant_id=NULL) receives KIOSK_PLANT_REQUIRED until a future
   plant-picker or explicit plant header is defined.

4. **Fresh capture per worker** — SDK must not reuse the failed-authenticate JPEG.
   Each enroll is a new blink/burst cycle.

5. **Audit** — every successful enroll writes AuditAction.ADMIN_KIOSK_ENROLL.

6. **Session** — re-validate admin_session_token on every /kiosk/admin-enroll call.
   Logout invalidates token immediately.

Transport
---------
  POST /kiosk/admin-login     application/json
  POST /kiosk/admin-enroll    multipart/form-data (employee_id + image)
  POST /kiosk/admin-logout    header: X-Admin-Session-Token

  Reuses AdminAuthService session store and header name as Admin Portal for
  one credential system; kiosk routes are a separate router (/kiosk/*) so
  portal grant/review endpoints are never exposed on the kiosk surface.

Scalability notes
-----------------
  - Schemas are kiosk-specific so Path B can evolve (batch metadata, kiosk_id)
    without breaking Admin Portal OpenAPI.
  - Multipart field constants are shared with the SDK via matching names.
  - Image pipeline error codes align with RegistrationErrorCode where behavior
    is identical (duplicate face, no face, etc.) — service maps as needed.
  - Optional fields (full_name, kiosk_id, session_id) are reserved on
    KioskAdminEnrollFormFields for future HR metadata without breaking v1 clients.

See docs/architecture/registration-flow.md and AGENTS.md §6.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.common.enums import EnrollmentStatus, RegistrationSource, RegistrationStatus

# ---------------------------------------------------------------------------
# HTTP surface
# ---------------------------------------------------------------------------

KIOSK_ADMIN_PREFIX = "/kiosk"
KIOSK_ADMIN_LOGIN_PATH = f"{KIOSK_ADMIN_PREFIX}/admin-login"
KIOSK_ADMIN_ENROLL_PATH = f"{KIOSK_ADMIN_PREFIX}/admin-enroll"
KIOSK_ADMIN_LOGOUT_PATH = f"{KIOSK_ADMIN_PREFIX}/admin-logout"

# Same header as Admin Portal — one session store in AdminAuthService.
KIOSK_ADMIN_SESSION_HEADER = "X-Admin-Session-Token"

# Multipart form keys for POST /kiosk/admin-enroll (v1).
KIOSK_ADMIN_ENROLL_EMPLOYEE_ID_FIELD = "employee_id"
KIOSK_ADMIN_ENROLL_IMAGE_FIELD = "image"

# Deferred — fleet registry not wired in current rollout.
KIOSK_ADMIN_ENROLL_KIOSK_ID_FIELD = "kiosk_id"

# Future — per-capture session id for audit (one fresh capture per worker).
KIOSK_ADMIN_ENROLL_SESSION_ID_FIELD = "session_id"


class KioskAdminErrorCode(StrEnum):
    """
    Stable machine codes for SDK kiosk admin branching.

    Overlaps AdminErrorCode where semantics match; kiosk-specific codes are
    prefixed conceptually (KIOSK_*) for client clarity.
    """

    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    ADMIN_INACTIVE = "ADMIN_INACTIVE"
    SESSION_EXPIRED = "SESSION_EXPIRED"
    UNAUTHORIZED = "UNAUTHORIZED"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    KIOSK_PLANT_REQUIRED = "KIOSK_PLANT_REQUIRED"
    PLANT_ACCESS_DENIED = "PLANT_ACCESS_DENIED"
    MISSING_EMPLOYEE_ID = "MISSING_EMPLOYEE_ID"
    EMPLOYEE_INACTIVE = "EMPLOYEE_INACTIVE"
    ALREADY_ENROLLED = "ALREADY_ENROLLED"
    PENDING_REGISTRATION_EXISTS = "PENDING_REGISTRATION_EXISTS"
    PLANT_MISMATCH = "PLANT_MISMATCH"
    DUPLICATE_FACE = "DUPLICATE_FACE"
    EMPTY_IMAGE = "EMPTY_IMAGE"
    INVALID_IMAGE = "INVALID_IMAGE"
    UNSUPPORTED_IMAGE_TYPE = "UNSUPPORTED_IMAGE_TYPE"
    IMAGE_TOO_LARGE = "IMAGE_TOO_LARGE"
    NO_FACE = "NO_FACE"
    MULTIPLE_FACES = "MULTIPLE_FACES"
    DETECT_FAILED = "DETECT_FAILED"
    EMBED_FAILED = "EMBED_FAILED"


class KioskAdminErrorResponse(BaseModel):
    """Error body for kiosk admin 4xx/5xx failures."""

    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    detail: str = Field(..., description="Human-readable error for kiosk UI.")
    code: KioskAdminErrorCode = Field(
        ...,
        description="Machine-readable KioskAdminErrorCode.",
    )


# ---------------------------------------------------------------------------
# POST /kiosk/admin-login
# ---------------------------------------------------------------------------


class KioskAdminLoginRequest(BaseModel):
    """
    Admin operator credentials at the kiosk.

    employee_id is the **admin's** business ID (admin_roles), not the worker
    being enrolled.
    """

    model_config = ConfigDict(populate_by_name=True)

    employee_id: str = Field(
        ...,
        validation_alias="employeeId",
        min_length=1,
        description="Admin operator Employee ID (admin_roles.employee_id).",
    )
    password: str = Field(
        ...,
        min_length=1,
        description="Admin portal password (same bcrypt hash as desk login).",
    )


class KioskAdminLoginResponse(BaseModel):
    """
    Success body for POST /kiosk/admin-login.

    plant_id is the workspace all subsequent enrollments are scoped to.
    SDK should display plant_code/plant_name read-only in the admin enroll loop.
    """

    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    admin_session_token: str = Field(
        ...,
        serialization_alias="adminSessionToken",
        description="Opaque token — send on enroll/logout via X-Admin-Session-Token.",
    )
    employee_id: str = Field(
        ...,
        serialization_alias="employeeId",
        description="Authenticated admin operator Employee ID.",
    )
    role: str = Field(
        ...,
        description="admin_roles.role — v1 enroll expects PLANT_ADMIN.",
    )
    plant_id: UUID | None = Field(
        default=None,
        serialization_alias="plantId",
        description=(
            "Plant workspace for enrollments. Non-null for PLANT_ADMIN. "
            "Null for SUPER_ADMIN — enroll blocked until plant context exists."
        ),
    )
    plant_code: str | None = Field(
        default=None,
        serialization_alias="plantCode",
        description="Optional display hint for kiosk UI (resolved server-side).",
    )
    plant_name: str | None = Field(
        default=None,
        serialization_alias="plantName",
        description="Optional display hint for kiosk UI (resolved server-side).",
    )
    expires_at: str = Field(
        ...,
        serialization_alias="expiresAt",
        description="ISO-8601 UTC session expiry.",
    )


# ---------------------------------------------------------------------------
# POST /kiosk/admin-enroll
# ---------------------------------------------------------------------------


class KioskAdminEnrollResponse(BaseModel):
    """
    Success body for POST /kiosk/admin-enroll (HTTP 201 Created).

    Worker is ACTIVE immediately — authenticate() may succeed on next visit.
    plant_id is echoed from the admin session (not from the request body).
    """

    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    success: bool = Field(
        default=True,
        description="Always true on HTTP 201 — explicit for SDK parity.",
    )
    request_id: UUID = Field(
        ...,
        serialization_alias="requestId",
        description="registration_requests.request_id — provenance / audit.",
    )
    employee_id: str = Field(
        ...,
        serialization_alias="employeeId",
        description="Target worker Employee ID enrolled by the admin.",
    )
    plant_id: UUID = Field(
        ...,
        serialization_alias="plantId",
        description="Plant assigned from admin session (server authoritative).",
    )
    enrollment_status: EnrollmentStatus = Field(
        default=EnrollmentStatus.ACTIVE,
        serialization_alias="enrollmentStatus",
        description="Always ACTIVE for Path B kiosk admin enroll.",
    )
    registration_status: RegistrationStatus = Field(
        default=RegistrationStatus.APPROVED,
        serialization_alias="registrationStatus",
        description="Always APPROVED — never PENDING for ADMIN_KIOSK.",
    )
    source: RegistrationSource = Field(
        default=RegistrationSource.ADMIN_KIOSK,
        description="Always ADMIN_KIOSK for this endpoint.",
    )
    message: str = Field(
        ...,
        description="Kiosk-friendly confirmation — worker may authenticate now.",
    )


class KioskAdminEnrollFormFields(BaseModel):
    """
    Documents multipart fields for POST /kiosk/admin-enroll (v1).

    **plant_id is intentionally absent** — server assigns plant from session.

    full_name is intentionally absent in v1 — service policy for new employees
    is defined in KioskAdminService (e.g. employee must exist or name derived).

    FastAPI binds via Form()/File() in the route — this model is the contract
    reference for OpenAPI + SDK, not the UploadFile wrapper itself.
    """

    model_config = ConfigDict(frozen=True)

    employee_id_field: Literal["employee_id"] = KIOSK_ADMIN_ENROLL_EMPLOYEE_ID_FIELD
    image_field: Literal["image"] = KIOSK_ADMIN_ENROLL_IMAGE_FIELD
    kiosk_id_field: Literal["kiosk_id"] = KIOSK_ADMIN_ENROLL_KIOSK_ID_FIELD
    session_id_field: Literal["session_id"] = KIOSK_ADMIN_ENROLL_SESSION_ID_FIELD
    accepted_image_types: tuple[str, ...] = (
        "image/jpeg",
        "image/jpg",
        "image/png",
        "application/octet-stream",
    )
    max_image_bytes: int = Field(
        default=8 * 1024 * 1024,
        description="Hard cap for one kiosk still (bytes). Align with settings.auth_max_image_bytes.",
    )


# ---------------------------------------------------------------------------
# POST /kiosk/admin-logout
# ---------------------------------------------------------------------------


class KioskAdminLogoutResponse(BaseModel):
    """Success body for POST /kiosk/admin-logout."""

    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    success: bool = Field(
        default=True,
        description="True when session token was invalidated.",
    )
    message: str = Field(
        default="Admin kiosk session ended.",
        description="Kiosk-friendly confirmation.",
    )
