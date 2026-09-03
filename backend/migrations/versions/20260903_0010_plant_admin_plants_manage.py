"""Backfill PLANTS_MANAGE onto existing PLANT_ADMIN roles.

Plant-scoped admins may read/update their own plant only. Create and
soft-deactivate stay global (session.plant_id IS NULL) — enforced in
plant_catalog, not by withholding this permission.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260903_0010"
down_revision: Union[str, Sequence[str], None] = "20260903_0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PERMISSION = "PLANTS_MANAGE"


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            INSERT INTO admin_role_permissions (role_id, permission_code)
            SELECT ar.role_id, :permission_code
            FROM admin_roles ar
            WHERE ar.role = 'PLANT_ADMIN'
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
            DELETE FROM admin_role_permissions arp
            USING admin_roles ar
            WHERE arp.role_id = ar.role_id
              AND ar.role = 'PLANT_ADMIN'
              AND arp.permission_code = :permission_code
            """
        ),
        {"permission_code": _PERMISSION},
    )
