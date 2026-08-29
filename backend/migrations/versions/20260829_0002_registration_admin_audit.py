"""Registration, admin RBAC, audit, and enrollment provenance FK.

Adds tables deferred from Week 1 (see docs/architecture/database-schema.md):
  registration_requests  — request metadata (no image bytes)
  raw_images             — BYTEA split for fast list queries
  admin_roles            — plant-scoped RBAC
  audit_log              — append-only sensitive-action history

Also links enrollments.source_request_id → registration_requests.request_id
(Week 1 column existed without FK until registration_requests existed).

Design order (FK-safe):
  1. registration_requests  (employees, plants already exist)
  2. raw_images
  3. admin_roles
  4. audit_log
  5. enrollments.source_request_id FK

source includes ADMIN_KIOSK (AGENTS.md) for future kiosk batch enroll path.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260829_0002"
down_revision: Union[str, Sequence[str], None] = "20260825_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- registration_requests (metadata only; images in raw_images) ---
    op.create_table(
        "registration_requests",
        sa.Column(
            "request_id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("employee_id", sa.Text(), nullable=False),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.Column("kiosk_id", sa.Text(), nullable=True),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Text(),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column("session_id", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_reason", sa.Text(), nullable=True),
        sa.Column(
            "captured_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "source IN ('KIOSK', 'ADMIN_PORTAL', 'ADMIN_KIOSK')",
            name="ck_registration_requests_source",
        ),
        sa.CheckConstraint(
            "status IN ('PENDING', 'APPROVED', 'REJECTED')",
            name="ck_registration_requests_status",
        ),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.employee_id"]),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.plant_id"]),
        sa.ForeignKeyConstraint(["reviewed_by"], ["employees.employee_id"]),
        sa.PrimaryKeyConstraint("request_id"),
    )
    op.create_index(
        "idx_registration_requests_employee_id",
        "registration_requests",
        ["employee_id"],
        unique=False,
    )
    op.execute(
        """
        CREATE UNIQUE INDEX idx_one_pending_per_emp
        ON registration_requests (employee_id)
        WHERE status = 'PENDING'
        """
    )
    op.create_index(
        "idx_reqs_plant_status",
        "registration_requests",
        ["plant_id", "status"],
        unique=False,
    )

    # --- raw_images (1:1 with request; never joined in list queries) ---
    op.create_table(
        "raw_images",
        sa.Column(
            "image_id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("image_data", sa.LargeBinary(), nullable=True),
        sa.Column(
            "captured_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["registration_requests.request_id"],
        ),
        sa.PrimaryKeyConstraint("image_id"),
        sa.UniqueConstraint("request_id"),
    )

    # --- admin_roles (desk + future kiosk admin login) ---
    op.create_table(
        "admin_roles",
        sa.Column(
            "role_id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("employee_id", sa.Text(), nullable=False),
        sa.Column("plant_id", sa.UUID(), nullable=True),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "role IN ('PLANT_ADMIN', 'SUPER_ADMIN')",
            name="ck_admin_roles_role",
        ),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.employee_id"]),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.plant_id"]),
        sa.PrimaryKeyConstraint("role_id"),
        sa.UniqueConstraint("employee_id"),
    )
    op.create_index(
        "idx_admin_roles_plant_id",
        "admin_roles",
        ["plant_id"],
        unique=False,
    )

    # --- audit_log (append-only; partition by month later at scale) ---
    op.create_table(
        "audit_log",
        sa.Column(
            "log_id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("actor_id", sa.Text(), nullable=True),
        sa.Column("actor_role", sa.Text(), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("target_type", sa.Text(), nullable=True),
        sa.Column("target_id", sa.Text(), nullable=True),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.Column("ip_address", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["employees.employee_id"]),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.plant_id"]),
        sa.PrimaryKeyConstraint("log_id"),
    )
    op.create_index(
        "idx_audit_plant_time",
        "audit_log",
        ["plant_id", "created_at"],
        unique=False,
    )

    # --- Week 1 enrollments: add provenance FK now that requests exist ---
    op.create_foreign_key(
        "fk_enrollments_source_request_id",
        "enrollments",
        "registration_requests",
        ["source_request_id"],
        ["request_id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_enrollments_source_request_id",
        "enrollments",
        type_="foreignkey",
    )
    op.drop_index("idx_audit_plant_time", table_name="audit_log")
    op.drop_table("audit_log")
    op.drop_index("idx_admin_roles_plant_id", table_name="admin_roles")
    op.drop_table("admin_roles")
    op.drop_table("raw_images")
    op.drop_index("idx_reqs_plant_status", table_name="registration_requests")
    op.execute("DROP INDEX IF EXISTS idx_one_pending_per_emp")
    op.drop_index(
        "idx_registration_requests_employee_id",
        table_name="registration_requests",
    )
    op.drop_table("registration_requests")
