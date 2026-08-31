"""Admin RBAC: SUB_ADMIN role + permission catalog and per-admin grants."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260831_0006"
down_revision: Union[str, Sequence[str], None] = "20260829_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Stable permission codes — also seeded into admin_permissions.
PERMISSION_SEED: tuple[tuple[str, str], ...] = (
    ("REGISTRATION_VIEW_PENDING", "View plant-scoped pending registration queue"),
    ("REGISTRATION_VIEW_IMAGE", "View registration capture image"),
    ("REGISTRATION_APPROVE", "Approve pending registration requests"),
    ("REGISTRATION_REJECT", "Reject pending registration requests"),
    ("ADMIN_GRANT_PLANT_ADMIN", "Create or update PLANT_ADMIN for any plant (super-admin only)"),
    ("ADMIN_GRANT_SUB_ADMIN", "Create or update SUB_ADMIN within own plant"),
)

ROLE_DEFAULT_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "SUPER_ADMIN": tuple(code for code, _ in PERMISSION_SEED),
    "PLANT_ADMIN": (
        "REGISTRATION_VIEW_PENDING",
        "REGISTRATION_VIEW_IMAGE",
        "REGISTRATION_APPROVE",
        "REGISTRATION_REJECT",
        "ADMIN_GRANT_SUB_ADMIN",
    ),
    "SUB_ADMIN": (
        "REGISTRATION_VIEW_PENDING",
        "REGISTRATION_VIEW_IMAGE",
        "REGISTRATION_APPROVE",
        "REGISTRATION_REJECT",
    ),
}


def upgrade() -> None:
    op.drop_constraint("ck_admin_roles_role", "admin_roles", type_="check")
    op.create_check_constraint(
        "ck_admin_roles_role",
        "admin_roles",
        "role IN ('SUPER_ADMIN', 'PLANT_ADMIN', 'SUB_ADMIN')",
    )

    op.add_column(
        "admin_roles",
        sa.Column("granted_by", sa.Text(), nullable=True),
    )
    op.create_foreign_key(
        "fk_admin_roles_granted_by",
        "admin_roles",
        "employees",
        ["granted_by"],
        ["employee_id"],
    )

    op.create_table(
        "admin_permissions",
        sa.Column("permission_code", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("permission_code"),
    )

    op.create_table(
        "admin_role_permissions",
        sa.Column(
            "role_id",
            sa.UUID(),
            sa.ForeignKey("admin_roles.role_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "permission_code",
            sa.Text(),
            sa.ForeignKey("admin_permissions.permission_code", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("role_id", "permission_code"),
    )
    op.create_index(
        "idx_admin_role_permissions_role_id",
        "admin_role_permissions",
        ["role_id"],
        unique=False,
    )

    permissions_table = sa.table(
        "admin_permissions",
        sa.column("permission_code", sa.Text),
        sa.column("description", sa.Text),
    )
    op.bulk_insert(
        permissions_table,
        [{"permission_code": code, "description": desc} for code, desc in PERMISSION_SEED],
    )

    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT role_id, role FROM admin_roles")
    ).fetchall()
    for role_id, role in rows:
        for code in ROLE_DEFAULT_PERMISSIONS.get(role, ()):
            conn.execute(
                sa.text(
                    """
                    INSERT INTO admin_role_permissions (role_id, permission_code)
                    VALUES (:role_id, :permission_code)
                    ON CONFLICT DO NOTHING
                    """
                ),
                {"role_id": role_id, "permission_code": code},
            )


def downgrade() -> None:
    op.drop_index("idx_admin_role_permissions_role_id", table_name="admin_role_permissions")
    op.drop_table("admin_role_permissions")
    op.drop_table("admin_permissions")

    op.drop_constraint("fk_admin_roles_granted_by", "admin_roles", type_="foreignkey")
    op.drop_column("admin_roles", "granted_by")

    op.drop_constraint("ck_admin_roles_role", "admin_roles", type_="check")
    op.create_check_constraint(
        "ck_admin_roles_role",
        "admin_roles",
        "role IN ('PLANT_ADMIN', 'SUPER_ADMIN')",
    )
