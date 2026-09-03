"""Seed PLANTS_MANAGE and backfill SUPER_ADMIN role permissions.

Aligns existing admin_role_permissions with ADMIN_ROLE_DEFAULT_PERMISSIONS:
SUPER_ADMIN receives the full permission catalog, including PLANTS_MANAGE.

Plant CRUD is gated on PLANTS_MANAGE (not role == SUPER_ADMIN). Future roles
can receive this permission via admin_role_permissions without a new enum.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260903_0009"
down_revision: Union[str, Sequence[str], None] = "20260831_0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PERMISSION = "PLANTS_MANAGE"
_CATALOG_DESCRIPTION = (
    "Create, update, and soft-deactivate plants in the plant catalog "
    "(role-agnostic; v1 default on SUPER_ADMIN)"
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
            WHERE ar.role = 'SUPER_ADMIN'
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
