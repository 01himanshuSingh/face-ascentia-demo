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


# v1 default permission sets copied to admin_role_permissions on grant / seed.
#
# Policy (see admin_rbac / plant_catalog for enforcement):
#   SUPER_ADMIN  — full catalog (every AdminPermissionCode); all plants;
#                  only global session (plant_id NULL) may create / deactivate plants
#   PLANT_ADMIN  — own plant only; registration review + grant + PLANTS_MANAGE
#                  (read/update own plant; cannot create another workspace)
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
