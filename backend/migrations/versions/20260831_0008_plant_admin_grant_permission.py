"""PLANT_ADMIN: grant ADMIN_GRANT_PLANT_ADMIN (plant-scoped via admin_rbac).

Aligns existing admin_role_permissions rows with ADMIN_ROLE_DEFAULT_PERMISSIONS in
app.common.enums. New grants/seeds already use enums; this backfills live DB rows.

Plant scope (PLANT_ADMIN → session.plant_id only) is enforced in
admin_rbac.assert_can_grant_role — not in this migration.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260831_0008"
down_revision: Union[str, Sequence[str], None] = "20260831_0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PERMISSION = "ADMIN_GRANT_PLANT_ADMIN"
_CATALOG_DESCRIPTION = (
    "Grant PLANT_ADMIN role (SUPER: any plant; PLANT admin: own plant only)"
)


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(
        sa.text(
            """
            UPDATE admin_permissions
            SET description = :description
            WHERE permission_code = :permission_code
            """
        ),
        {"description": _CATALOG_DESCRIPTION, "permission_code": _PERMISSION},
    )

    conn.execute(
        sa.text(
            """
            INSERT INTO admin_role_permissions (role_id, permission_code)
            SELECT ar.role_id, :permission_code
            FROM admin_roles ar
            WHERE ar.role = 'PLANT_ADMIN'
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
            DELETE FROM admin_role_permissions arp
            USING admin_roles ar
            WHERE arp.role_id = ar.role_id
              AND ar.role = 'PLANT_ADMIN'
              AND arp.permission_code = :permission_code
            """
        ),
        {"permission_code": _PERMISSION},
    )

    conn.execute(
        sa.text(
            """
            UPDATE admin_permissions
            SET description = 'Create or update PLANT_ADMIN for any plant (super-admin only)'
            WHERE permission_code = :permission_code
            """
        ),
        {"permission_code": _PERMISSION},
    )
