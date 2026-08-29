"""
Employee registration API contracts (kiosk Path A — manual self-register).

System design boundary
----------------------
  Mendix login → SDK.authenticate(employeeId)
        ↓  single capture: blink + best JPEG
        ↓  POST /authenticate
  Backend → 404 ENROLLMENT_NOT_FOUND (employee exists, not face-enrolled)
        ↓
  Mendix Register UI — Employee ID only (confirm / re-type; NO second capture)
        ↓  SDK.register(confirmedEmployeeId) reuses lastCapture from auth
        ↓  POST /register  (multipart)
  Debian FastAPI
        employee_id → employee must exist + ACTIVE
        image bytes → same JPEG from auth; detect + embed (quality / duplicate checks)
        ↓
  registration_requests  status=PENDING, source=KIOSK
  raw_images             image bytes (metadata split — never in list joins)
        ↓
  NO enrollments row yet — login stays blocked until admin APPROVE

SDK rule: register() must NOT open the camera when lastCapture is available.
Backend does not distinguish reused vs fresh image — always expects employee_id + image.

Contrast with other paths (do not merge contracts)
--------------------------------------------------
  POST /authenticate     → reads ACTIVE enrollment only
  POST /register         → creates PENDING request (Path A — image reused from auth)
  POST /kiosk/admin-enroll → ADMIN_KIOSK, APPROVED immediately (Path B — fresh capture per employee)
  Admin Portal approve   → PENDING → ACTIVE enrollment (admin schemas)

Transport
---------
multipart/form-data (same as auth — SDK posts FaceCaptureResult.blob):
  - employee_id  (required — confirmed on Register UI)
  - plant_id       (required — employee selects plant for admin queue routing)
  - full_name      (required — HR offline matching hint)
  - image          (required, JPEG — reused from authenticate capture)
  - kiosk_id     (optional — NOT sent in current rollout; device fleet id; NULL in DB)
  - session_id   (Path A: same SDK capture-session id as authenticate; see below)

Kiosk device identity — kiosk_id (deferred)
--------------------------------------------
Both Path A and Path B run at a physical kiosk but do NOT send kiosk_id yet
(~70-kiosk fleet registry is future work). Omit entirely; DB stores NULL.

Capture session — session_id (Path A employee register)
---------------------------------------------------------
session_id is NOT kiosk metadata. It identifies the SDK camera capture session:
one blink/burst cycle that produced the JPEG.

Path A flow:
  1. authenticate() opens capture → SDK assigns session_id (e.g. UUID)
  2. POST /authenticate may include session_id (when auth contract adds it)
  3. Register reuses that JPEG → POST /register MUST send the **same** session_id
     so registration_requests links to the auth capture attempt (audit / support).

Path B admin enroll uses a **new** capture per employee — each enroll gets its own
session_id when the SDK implements capture sessions.

HTTP/DB nullability today
---------------------------
session_id is optional on the route only because the SDK does not generate or send
it yet (Week 1 auth has no session_id field). Once FaceCaptureResult carries
sessionId, RegistrationService should require session_id for source=KIOSK.
DB column stays nullable for legacy rows and admin-portal sources.

Success is HTTP 201 with RegisterResponse — not authenticated=true.
Pending registration does NOT grant login (authenticate requires ACTIVE enrollment).

See docs/architecture/registration-flow.md for the full sequence diagram.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.common.enums import RegistrationSource, RegistrationStatus


class RegistrationErrorCode(StrEnum):
    """
    Stable machine codes for SDK registration branching.
    Separate from AuthErrorCode — registration is a different use case.
    Image pipeline codes mirror auth where behavior is identical.
    """

    MISSING_EMPLOYEE_ID = "MISSING_EMPLOYEE_ID"
    MISSING_PLANT_ID = "MISSING_PLANT_ID"
    MISSING_FULL_NAME = "MISSING_FULL_NAME"
    PLANT_NOT_FOUND = "PLANT_NOT_FOUND"
    PLANT_MISMATCH = "PLANT_MISMATCH"
    EMPLOYEE_NOT_FOUND = "EMPLOYEE_NOT_FOUND"
    EMPLOYEE_INACTIVE = "EMPLOYEE_INACTIVE"
    ALREADY_ENROLLED = "ALREADY_ENROLLED"
    PENDING_REGISTRATION_EXISTS = "PENDING_REGISTRATION_EXISTS"
    DUPLICATE_FACE = "DUPLICATE_FACE"
    EMPTY_IMAGE = "EMPTY_IMAGE"
    INVALID_IMAGE = "INVALID_IMAGE"
    UNSUPPORTED_IMAGE_TYPE = "UNSUPPORTED_IMAGE_TYPE"
    IMAGE_TOO_LARGE = "IMAGE_TOO_LARGE"
    NO_FACE = "NO_FACE"
    MULTIPLE_FACES = "MULTIPLE_FACES"
    DETECT_FAILED = "DETECT_FAILED"
    EMBED_FAILED = "EMBED_FAILED"
    EMBEDDING_DIMENSION_MISMATCH = "EMBEDDING_DIMENSION_MISMATCH"


class RegisterResponse(BaseModel):
    """
    Success body for POST /register (HTTP 201 Created).

    Confirms a PENDING registration was stored. Employee must wait for
    admin approval before authenticate() can succeed.

    JSON field names use camelCase aliases for SDK parity (auth.types pattern).
    """

    model_config = ConfigDict(
        populate_by_name=True,
        ser_json_by_alias=True,
    )

    request_id: UUID = Field(
        ...,
        serialization_alias="requestId",
        description="registration_requests.request_id — provenance for approve flow.",
    )
    employee_id: str = Field(
        ...,
        serialization_alias="employeeId",
        description="Business Employee ID submitted at the kiosk.",
    )
    plant_id: UUID = Field(
        ...,
        serialization_alias="plantId",
        description="Plant workspace selected at kiosk — routes to plant admin queue.",
    )
    submitted_full_name: str = Field(
        ...,
        serialization_alias="submittedFullName",
        description="Full name submitted at kiosk for HR offline verification.",
    )
    status: RegistrationStatus = Field(
        default=RegistrationStatus.PENDING,
        description="Always PENDING for kiosk employee self-register.",
    )
    source: RegistrationSource = Field(
        default=RegistrationSource.KIOSK,
        description="Always KIOSK for this endpoint (ADMIN_KIOSK uses kiosk admin routes).",
    )
    message: str = Field(
        ...,
        description="Kiosk-friendly confirmation — e.g. wait for admin approval.",
    )
    submitted_at: str | None = Field(
        default=None,
        serialization_alias="submittedAt",
        description="ISO-8601 captured_at from registration_requests (optional).",
    )


class RegistrationErrorResponse(BaseModel):
    """
    Error body for registration 4xx failures.

    Same shape as AuthErrorResponse for a single main.py handler pattern;
    `code` uses RegistrationErrorCode instead of AuthErrorCode.
    """

    model_config = ConfigDict(
        populate_by_name=True,
        ser_json_by_alias=True,
    )

    detail: str = Field(..., description="Human-readable error.")
    code: RegistrationErrorCode = Field(
        ...,
        description="Machine-readable RegistrationErrorCode.",
    )


class RegisterFormFields(BaseModel):
    """
    Documents multipart fields for POST /register.

    `image` is normally the same JPEG already captured during authenticate()
    (SDK lastCapture reuse) — not a fresh kiosk capture.

    Current Mendix/SDK integration omits kiosk_id (device fleet not wired).

    session_id: required for Path A once SDK adds capture session ids to
    FaceCaptureResult — same value as the authenticate capture being reused.
    Route binds Form(default=None) until SDK ships; service enforces for KIOSK.

    FastAPI binds via Form()/File() in the route — this model is the contract
    reference for OpenAPI + SDK, not the UploadFile wrapper itself.
    """

    model_config = ConfigDict(frozen=True)

    employee_id_field: Literal["employee_id"] = "employee_id"
    image_field: Literal["image"] = "image"
    full_name_field: Literal["full_name"] = "full_name"
    plant_id_field: Literal["plant_id"] = "plant_id"
    kiosk_id_field: Literal["kiosk_id"] = "kiosk_id"
    session_id_field: Literal["session_id"] = "session_id"
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


# Canonical HTTP path + form keys — import in routes and SDK to avoid typos.
REGISTER_PATH = "/register"
REGISTER_EMPLOYEE_ID_FIELD = "employee_id"
REGISTER_IMAGE_FIELD = "image"
REGISTER_FULL_NAME_FIELD = "full_name"
REGISTER_PLANT_ID_FIELD = "plant_id"
REGISTER_KIOSK_ID_FIELD = "kiosk_id"
REGISTER_SESSION_ID_FIELD = "session_id"
