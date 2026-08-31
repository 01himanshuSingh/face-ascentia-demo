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
    """Permission codes mapped to admin_roles via admin_role_permissions."""

    REGISTRATION_VIEW_PENDING = "REGISTRATION_VIEW_PENDING"
    REGISTRATION_VIEW_IMAGE = "REGISTRATION_VIEW_IMAGE"
    REGISTRATION_APPROVE = "REGISTRATION_APPROVE"
    REGISTRATION_REJECT = "REGISTRATION_REJECT"
    ADMIN_GRANT_PLANT_ADMIN = "ADMIN_GRANT_PLANT_ADMIN"
    # Catalog only in v1 — not assigned until sub-admin phase.
    ADMIN_GRANT_SUB_ADMIN = "ADMIN_GRANT_SUB_ADMIN"


# v1 defaults copied to admin_role_permissions on grant.
# SUB_ADMIN entry kept for future use; grant API rejects SUB_ADMIN in v1.
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
