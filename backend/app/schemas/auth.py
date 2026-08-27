"""
Authenticate API contracts (Week 1).

System design boundary
----------------------
  Mendix / test-harness
        ↓  FaceAuthSDK.captureFace()  → one best JPEG (blink already done in SDK)
        ↓  FaceAuthSDK.authenticate(employeeId, frame)
  POST /authenticate  (multipart)
        ↓
  Debian FastAPI
        employee_id → ACTIVE employee → ACTIVE enrollment embedding
        image bytes → detector → SFace embed → cosine 1:1 → decision

What this module is
-------------------
Pydantic shapes for the HTTP edge only. No DB, no OpenCV, no MediaPipe.

What this module is not
-----------------------
- Browser blink / burst capture (SDK-owned)
- Registration / raw_images / audit (later phases)
- 1:N gallery search (auth is Employee ID → 1:1 only)

Transport choice
----------------
multipart/form-data:
  - employee_id: str
  - image: file (image/jpeg from FaceCaptureResult.blob)

Prefer multipart over base64 JSON so the SDK can POST the blob directly
and plant WAN stays one compressed JPEG (~640px), not a burst of frames.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AuthErrorCode(StrEnum):
    """
    Stable machine codes for SDK / Mendix branching.
    Keep values short and immutable once shipped to the npm package.
    """

    MISSING_EMPLOYEE_ID = "MISSING_EMPLOYEE_ID"
    EMPLOYEE_NOT_FOUND = "EMPLOYEE_NOT_FOUND"
    EMPLOYEE_INACTIVE = "EMPLOYEE_INACTIVE"
    ENROLLMENT_NOT_FOUND = "ENROLLMENT_NOT_FOUND"
    EMPTY_IMAGE = "EMPTY_IMAGE"
    INVALID_IMAGE = "INVALID_IMAGE"
    UNSUPPORTED_IMAGE_TYPE = "UNSUPPORTED_IMAGE_TYPE"
    IMAGE_TOO_LARGE = "IMAGE_TOO_LARGE"
    NO_FACE = "NO_FACE"
    MULTIPLE_FACES = "MULTIPLE_FACES"
    DETECT_FAILED = "DETECT_FAILED"
    EMBED_FAILED = "EMBED_FAILED"
    EMBEDDING_DIMENSION_MISMATCH = "EMBEDDING_DIMENSION_MISMATCH"


class AuthenticateResponse(BaseModel):
    """
    Success-path body for POST /authenticate (HTTP 200).

    Always returned when the pipeline ran to a match decision — including
    authenticated=false (wrong face for this Employee ID). That is not an
    HTTP error; Mendix should treat `authenticated` as the gate.

    Field names are camelCase in JSON so they align with
    sdk/src/types/auth.types.ts AuthenticateResult without a second mapper.
    """

    model_config = ConfigDict(
        populate_by_name=True,
        ser_json_by_alias=True,
    )

    employee_id: str = Field(
        ...,
        serialization_alias="employeeId",
        description="Employee ID that was verified (1:1, not gallery search).",
    )
    authenticated: bool = Field(
        ...,
        description="True when live cosine score >= configured threshold.",
    )
    score: float | None = Field(
        default=None,
        description="Cosine similarity vs ACTIVE enrollment (higher = closer). "
        "Null only if match could not be computed (should not happen on 200).",
    )
    threshold: float = Field(
        ...,
        description="Server cosine gate used for this decision "
        "(from settings.face_match_cosine_threshold when wired).",
    )
    message: str = Field(
        ...,
        description="Human-readable result for kiosk / harness UI.",
    )
    full_name: str | None = Field(
        default=None,
        serialization_alias="fullName",
        description="Display name from employees.full_name when authenticated path loads employee.",
    )
    model_version: str | None = Field(
        default=None,
        serialization_alias="modelVersion",
        description="SFace model version used for the live embedding.",
    )
    enrollment_model_version: str | None = Field(
        default=None,
        serialization_alias="enrollmentModelVersion",
        description="Model version stamped on the ACTIVE enrollment row.",
    )


class AuthErrorResponse(BaseModel):
    """
    Error body for 4xx auth failures (missing employee, no face, bad image, …).

    Shape is FastAPI-friendly (`detail`) plus a stable `code` for the SDK.
    """

    model_config = ConfigDict(
        populate_by_name=True,
        ser_json_by_alias=True,
    )

    detail: str = Field(..., description="Human-readable error.")
    code: AuthErrorCode = Field(..., description="Machine-readable AuthErrorCode.")


class AuthenticateFormFields(BaseModel):
    """
    Documents the multipart form fields expected by POST /authenticate.

    FastAPI will bind these via Form()/File() in the route — this model is the
    contract reference for SDK + OpenAPI descriptions, not the UploadFile itself.
    """

    model_config = ConfigDict(frozen=True)

    employee_id_field: Literal["employee_id"] = "employee_id"
    image_field: Literal["image"] = "image"
    accepted_image_types: tuple[str, ...] = (
        "image/jpeg",
        "image/jpg",
        "image/png",
        "application/octet-stream",
    )
    max_image_bytes: int = Field(
        default=8 * 1024 * 1024,
        description="Hard cap for one kiosk still (bytes).",
    )


# Canonical form field names — import these in routes/SDK docs to avoid typos.
AUTHENTICATE_EMPLOYEE_ID_FIELD = "employee_id"
AUTHENTICATE_IMAGE_FIELD = "image"
