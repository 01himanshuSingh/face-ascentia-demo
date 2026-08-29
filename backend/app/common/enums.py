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
    PLANT_ADMIN = "PLANT_ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


class AuditAction(StrEnum):
    LOGIN = "LOGIN"
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    VIEW_IMAGE = "VIEW_IMAGE"
    REVOKE = "REVOKE"
    ADMIN_KIOSK_ENROLL = "ADMIN_KIOSK_ENROLL"
