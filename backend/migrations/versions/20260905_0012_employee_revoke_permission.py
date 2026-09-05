"""Seed EMPLOYEE_REVOKE and backfill SUPER_ADMIN + PLANT_ADMIN.

Soft-revoke enrolled workers (INACTIVE + enrollment REVOKED + auto-ungrant).
Does not hard-delete employees.rows. Plant scope enforced in service.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260905_0012"
down_revision: Union[str, Sequence[str], None] = "20260904_0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PERMISSION = "EMPLOYEE_REVOKE"
_CATALOG_DESCRIPTION = (
    "Soft-revoke enrolled workers in a plant workspace "
    "(INACTIVE + face enrollment REVOKED; auto-ungrant admin if any)"
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
