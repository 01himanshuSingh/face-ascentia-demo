"""Seed AUTH_LOG_VIEW and backfill SUPER_ADMIN + PLANT_ADMIN role permissions.

Read-only plant-scoped kiosk authentication attempts (GET /admin/auth-log*).

Why a dedicated permission
--------------------------
Gate the Auth Log tab / API on AUTH_LOG_VIEW so ops can hide LOGIN history
without removing compliance Audit (AUDIT_VIEW) or registration review.

v1 defaults (see AdminPermissionCode / ADMIN_ROLE_DEFAULT_PERMISSIONS):
  SUPER_ADMIN  — full catalog (includes AUTH_LOG_VIEW via frozenset(enum))
  PLANT_ADMIN  — AUTH_LOG_VIEW for own plant workspace only (enforced in service)

This migration inserts the catalog row and backfills existing active roles.
New grants copy defaults from enums at grant/seed time.

LOGIN rows are never included in GET /admin/audit category chips.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260909_0014"
down_revision: Union[str, Sequence[str], None] = "20260907_0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PERMISSION = "AUTH_LOG_VIEW"
_CATALOG_DESCRIPTION = (
    "View plant-scoped kiosk authentication attempts "
    "(success/failure, reason codes, match percent). Text only — no images."
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
