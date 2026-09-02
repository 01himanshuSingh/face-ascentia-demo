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
    v1 uses fixed defaults below — future SUPER-only UI may edit per-admin rows
    without changing these enum codes.
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


# v1 default permission sets copied to admin_role_permissions on grant / seed.
#
# Policy (see admin_rbac for enforcement):
#   SUPER_ADMIN  — all plants; may grant PLANT_ADMIN for any plant
#   PLANT_ADMIN  — own plant only; registration review + grant PLANT_ADMIN in plant
#   SUB_ADMIN    — reserved; defaults kept for future phase; grant API rejects in v1
#
# Dynamic RBAC UI (future): same tables; SUPER edits admin_role_permissions rows.
ADMIN_ROLE_DEFAULT_PERMISSIONS: dict[AdminRoleType, frozenset[AdminPermissionCode]] = {
    AdminRoleType.SUPER_ADMIN: frozenset(
        {
            AdminPermissionCode.REGISTRATION_VIEW_PENDING,
            AdminPermissionCode.REGISTRATION_VIEW_IMAGE,
            AdminPermissionCode.REGISTRATION_APPROVE,
            AdminPermissionCode.REGISTRATION_REJECT,
            AdminPermissionCode.ADMIN_GRANT_PLANT_ADMIN,
        }
    ),
    AdminRoleType.PLANT_ADMIN: frozenset(
        {
            AdminPermissionCode.REGISTRATION_VIEW_PENDING,
            AdminPermissionCode.REGISTRATION_VIEW_IMAGE,
            AdminPermissionCode.REGISTRATION_APPROVE,
            AdminPermissionCode.REGISTRATION_REJECT,
            AdminPermissionCode.ADMIN_GRANT_PLANT_ADMIN,
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
