"""Seed AUDIT_VIEW and backfill SUPER_ADMIN + PLANT_ADMIN role permissions.

Read-only plant-scoped audit timeline (GET /admin/audit).

Why a dedicated permission
--------------------------
Gate the Audit tab / API on AUDIT_VIEW so ops can hide audit later without
removing registration review (REGISTRATION_*). Same pattern as PLANTS_MANAGE.

v1 defaults (see AdminPermissionCode / ADMIN_ROLE_DEFAULT_PERMISSIONS):
  SUPER_ADMIN  — full catalog (includes AUDIT_VIEW via frozenset(enum))
  PLANT_ADMIN  — AUDIT_VIEW for own plant workspace only (enforced in service)

This migration inserts the catalog row and backfills existing active roles.
New grants copy defaults from enums at grant/seed time.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260904_0011"
down_revision: Union[str, Sequence[str], None] = "20260903_0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PERMISSION = "AUDIT_VIEW"
_CATALOG_DESCRIPTION = (
    "View plant-scoped audit timeline "
    "(registrations, admin grant/revoke, kiosk enroll, plants). No images."
)


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(
        sa.text(
            """
            INSERT INTO admin_permissions (permission_code, description)
            VALUES (:permission_code, :description)
            ON CONFLICT (permission_code) DO UPDATE
            SET description = EXCLUDED.description
            """
        ),
        {"permission_code": _PERMISSION, "description": _CATALOG_DESCRIPTION},
    )

    conn.execute(
        sa.text(
            """
            INSERT INTO admin_role_permissions (role_id, permission_code)
            SELECT ar.role_id, :permission_code
            FROM admin_roles ar
            WHERE ar.role IN ('SUPER_ADMIN', 'PLANT_ADMIN')
              AND ar.is_active IS TRUE
            ON CONFLICT DO NOTHING
            """
        ),
        {"permission_code": _PERMISSION},
    )


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(
        sa.text(
            """
            DELETE FROM admin_role_permissions
            WHERE permission_code = :permission_code
            """
        ),
        {"permission_code": _PERMISSION},
    )

    conn.execute(
        sa.text(
            """
            DELETE FROM admin_permissions
            WHERE permission_code = :permission_code
            """
        ),
        {"permission_code": _PERMISSION},
    )
