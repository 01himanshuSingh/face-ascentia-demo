from enum import StrEnum


class EmployeeStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class EnrollmentStatus(StrEnum):
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"


class RegistrationStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class RegistrationSource(StrEnum):
    KIOSK = "KIOSK"
    ADMIN_PORTAL = "ADMIN_PORTAL"
    ADMIN_KIOSK = "ADMIN_KIOSK"


class AdminRoleType(StrEnum):
    SUPER_ADMIN = "SUPER_ADMIN"
    PLANT_ADMIN = "PLANT_ADMIN"
    # Reserved for a future phase — not granted or used in v1.
    SUB_ADMIN = "SUB_ADMIN"


class AdminPermissionCode(StrEnum):
    """Permission codes mapped to admin_roles via admin_role_permissions.

    Catalog lives in admin_permissions; effective grants in admin_role_permissions.
    Runtime checks use session.permissions (DB), never ``session.role == SUPER``.

    v1 copies defaults below on grant/seed. Future dynamic RBAC UI may assign any
    catalog permission to any role/admin without changing these enum codes —
    e.g. a future ops role can receive PLANTS_MANAGE the same way SUPER does today.
    """

    REGISTRATION_VIEW_PENDING = "REGISTRATION_VIEW_PENDING"
    REGISTRATION_VIEW_IMAGE = "REGISTRATION_VIEW_IMAGE"
    REGISTRATION_APPROVE = "REGISTRATION_APPROVE"
    REGISTRATION_REJECT = "REGISTRATION_REJECT"
    # Grant PLANT_ADMIN via POST /admin/users/grant.
    # Plant scope: SUPER_ADMIN → any plant; PLANT_ADMIN → session.plant_id only
    # (enforced in admin_rbac.assert_can_grant_role, not in this enum).
    ADMIN_GRANT_PLANT_ADMIN = "ADMIN_GRANT_PLANT_ADMIN"
    # Catalog only in v1 — not assigned until sub-admin phase.
    ADMIN_GRANT_SUB_ADMIN = "ADMIN_GRANT_SUB_ADMIN"
    # Plant catalog CRUD (create / update / soft-deactivate).
    # Role-agnostic permission: v1 default maps to SUPER_ADMIN (all permissions).
    # Future roles can receive PLANTS_MANAGE via admin_role_permissions without a new enum.
    PLANTS_MANAGE = "PLANTS_MANAGE"
    # Read-only plant-scoped audit timeline (GET /admin/audit).
    # Dedicated so audit UI can be revoked without removing registration review.
    # No images in this permission — face bytes stay on registration image routes.
    AUDIT_VIEW = "AUDIT_VIEW"
    # Read-only plant-scoped kiosk authentication attempts (GET /admin/auth-log).
    # Separate from AUDIT_VIEW so Auth Log can be granted/revoked without
    # compliance Audit access (and vice versa). Text metadata only — no faces.
    AUTH_LOG_VIEW = "AUTH_LOG_VIEW"
    # Soft-revoke approved workers: INACTIVE + enrollment REVOKED (+ auto-ungrant).
    # Plant-scoped; does not hard-delete employee_id.
    EMPLOYEE_REVOKE = "EMPLOYEE_REVOKE"


# v1 default permission sets copied to admin_role_permissions on grant / seed.
#
# Policy (see admin_rbac / plant_catalog for enforcement):
#   SUPER_ADMIN  — full catalog (every AdminPermissionCode); all plants;
#                  only global session (plant_id NULL) may create / deactivate plants
#   PLANT_ADMIN  — own plant only; registration review + grant + PLANTS_MANAGE
#                  + AUDIT_VIEW + AUTH_LOG_VIEW + EMPLOYEE_REVOKE (own plant)
#   SUB_ADMIN    — reserved; defaults kept for future phase; grant API rejects in v1
#
# Dynamic RBAC UI (future): same tables; edit admin_role_permissions per role/admin.
# Gate features on permission codes (e.g. PLANTS_MANAGE), not on role == SUPER_ADMIN.
ADMIN_ROLE_DEFAULT_PERMISSIONS: dict[AdminRoleType, frozenset[AdminPermissionCode]] = {
    # SUPER always gets the full permission catalog — including new codes added later.
    AdminRoleType.SUPER_ADMIN: frozenset(AdminPermissionCode),
    AdminRoleType.PLANT_ADMIN: frozenset(
        {
            AdminPermissionCode.REGISTRATION_VIEW_PENDING,
            AdminPermissionCode.REGISTRATION_VIEW_IMAGE,
            AdminPermissionCode.REGISTRATION_APPROVE,
            AdminPermissionCode.REGISTRATION_REJECT,
            AdminPermissionCode.ADMIN_GRANT_PLANT_ADMIN,
            # Own plant catalog read/update only — create/deactivate blocked in plant_catalog.
            AdminPermissionCode.PLANTS_MANAGE,
            AdminPermissionCode.AUDIT_VIEW,
            AdminPermissionCode.AUTH_LOG_VIEW,
            AdminPermissionCode.EMPLOYEE_REVOKE,
        }
    ),
    AdminRoleType.SUB_ADMIN: frozenset(
        {
            AdminPermissionCode.REGISTRATION_VIEW_PENDING,
            AdminPermissionCode.REGISTRATION_VIEW_IMAGE,
            AdminPermissionCode.REGISTRATION_APPROVE,
            AdminPermissionCode.REGISTRATION_REJECT,
        }
    ),
}


class AuditAction(StrEnum):
    """Actions written to ``audit_log.action`` (append-only).

    Two portal surfaces share this table — never mix them in UI filters:

    Compliance Audit (GET /admin/audit) — category chips only:
      approved      → APPROVE
      rejected      → REJECT
      admins        → ADMIN_GRANT, REVOKE
      kiosk         → ADMIN_KIOSK_ENROLL
      plants        → PLANT_CREATE, PLANT_UPDATE, PLANT_DEACTIVATE
      employees     → EMPLOYEE_REVOKE
      ``all``       → union of the above only (never LOGIN / VIEW_IMAGE)

    Auth Log (GET /admin/auth-log) — dedicated sidebar tab:
      LOGIN only — high-volume kiosk authenticate attempts (text metadata).
      Result + reason live in ``metadata`` (see AuthLogResult / AuthLogReasonCode).

    Stored but not in either default portal list until a dedicated surface exists:
      VIEW_IMAGE — noisy PII access trail
    """

    LOGIN = "LOGIN"
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    VIEW_IMAGE = "VIEW_IMAGE"
    REVOKE = "REVOKE"
    ADMIN_KIOSK_ENROLL = "ADMIN_KIOSK_ENROLL"
    ADMIN_GRANT = "ADMIN_GRANT"
    # Plant catalog (soft-deactivate, never hard-delete with dependents).
    PLANT_CREATE = "PLANT_CREATE"
    PLANT_UPDATE = "PLANT_UPDATE"
    PLANT_DEACTIVATE = "PLANT_DEACTIVATE"
    # Soft-revoke enrolled worker (INACTIVE + enrollment REVOKED).
    EMPLOYEE_REVOKE = "EMPLOYEE_REVOKE"


class AuthLogResult(StrEnum):
    """Outcome of one ``POST /authenticate`` attempt (Auth Log KPI + filters).

    Written into ``audit_log.metadata.result`` on every LOGIN row.
    HTTP layer may still return 200 with authenticated=false (FACE_MISMATCH) —
    that is AuthLogResult.FAILURE for the dashboard.
    """

    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"


class AuthLogReasonCode(StrEnum):
    """Stable technical reason for one LOGIN row (text-only Auth Log).

    Stored in ``audit_log.metadata.reason_code``. Portal shows a human label
    derived from this code; never invent free-text reasons at write time.

    Align values with ``AuthErrorCode`` where the failure originates there so
    authentication.py can map 1:1. Extra codes cover the match decision path
    that returns HTTP 200 (success and face mismatch).
    """

    # HTTP 200 — pipeline reached a 1:1 score decision
    MATCH_OK = "MATCH_OK"
    FACE_MISMATCH = "FACE_MISMATCH"

    # Identity / enrollment gates (align with AuthErrorCode)
    MISSING_EMPLOYEE_ID = "MISSING_EMPLOYEE_ID"
    EMPLOYEE_NOT_FOUND = "EMPLOYEE_NOT_FOUND"
    EMPLOYEE_INACTIVE = "EMPLOYEE_INACTIVE"
    ENROLLMENT_NOT_FOUND = "ENROLLMENT_NOT_FOUND"

    # Image / detect / embed gates (align with AuthErrorCode)
    EMPTY_IMAGE = "EMPTY_IMAGE"
    INVALID_IMAGE = "INVALID_IMAGE"
    UNSUPPORTED_IMAGE_TYPE = "UNSUPPORTED_IMAGE_TYPE"
    IMAGE_TOO_LARGE = "IMAGE_TOO_LARGE"
    NO_FACE = "NO_FACE"
    MULTIPLE_FACES = "MULTIPLE_FACES"
    DETECT_FAILED = "DETECT_FAILED"
    EMBED_FAILED = "EMBED_FAILED"
    EMBEDDING_DIMENSION_MISMATCH = "EMBEDDING_DIMENSION_MISMATCH"

    # Catch-all when the attempt failed but no tighter code applies
    UNKNOWN = "UNKNOWN"


# Metadata keys for LOGIN rows — keep writers/readers on the same contract.
AUTH_LOG_METADATA_RESULT_KEY = "result"
AUTH_LOG_METADATA_REASON_CODE_KEY = "reason_code"
# Optional extras (text only; never face bytes / embeddings).
AUTH_LOG_METADATA_SCORE_KEY = "score"
AUTH_LOG_METADATA_THRESHOLD_KEY = "threshold"
AUTH_LOG_METADATA_KIOSK_ID_KEY = "kiosk_id"
AUTH_LOG_METADATA_MESSAGE_KEY = "message"
