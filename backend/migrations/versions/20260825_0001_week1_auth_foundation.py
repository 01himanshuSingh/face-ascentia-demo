"""Week 1 auth foundation: plants, employees, enrollments + pgvector.

Verification notes (see docs/architecture/database-schema.md):
- VECTOR(128) is provisional until the production SFace model dimension is confirmed.
- source_request_id has no FK yet (registration_requests deferred to a later phase).
- HNSW index created for future 1:N searches; auth login remains 1:1 by employee_id.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision: str = "20260825_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMBEDDING_DIMENSIONS = 128


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "plants",
        sa.Column(
            "plant_id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("plant_name", sa.Text(), nullable=False),
        sa.Column("plant_code", sa.Text(), nullable=False),
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
        sa.PrimaryKeyConstraint("plant_id"),
        sa.UniqueConstraint("plant_code"),
    )

    op.create_table(
        "employees",
        sa.Column("employee_id", sa.Text(), nullable=False),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.Column("full_name", sa.Text(), nullable=False),
        sa.Column("department", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Text(),
            server_default="ACTIVE",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('ACTIVE', 'INACTIVE')",
            name="ck_employees_status",
        ),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.plant_id"]),
        sa.PrimaryKeyConstraint("employee_id"),
    )
    op.create_index("idx_employees_plant", "employees", ["plant_id"], unique=False)

    op.create_table(
        "enrollments",
        sa.Column(
            "enrollment_id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("employee_id", sa.Text(), nullable=False),
        sa.Column("plant_id", sa.UUID(), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIMENSIONS), nullable=False),
        sa.Column(
            "status",
            sa.Text(),
            server_default="ACTIVE",
            nullable=False,
        ),
        sa.Column("source_request_id", sa.UUID(), nullable=True),
        sa.Column("model_version", sa.Text(), nullable=False),
        sa.Column("revoked_by", sa.Text(), nullable=True),
        sa.Column("revoked_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('ACTIVE', 'REVOKED')",
            name="ck_enrollments_status",
        ),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.employee_id"]),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.plant_id"]),
        sa.ForeignKeyConstraint(["revoked_by"], ["employees.employee_id"]),
        sa.PrimaryKeyConstraint("enrollment_id"),
    )
    op.create_index(
        "idx_enrollments_employee_id",
        "enrollments",
        ["employee_id"],
        unique=False,
    )
    op.create_index(
        "idx_enrollments_plant_id",
        "enrollments",
        ["plant_id"],
        unique=False,
    )
    op.execute(
        """
        CREATE UNIQUE INDEX idx_enroll_active_emp
        ON enrollments (employee_id)
        WHERE status = 'ACTIVE'
        """
    )
    op.execute(
        """
        CREATE INDEX idx_enroll_vector
        ON enrollments
        USING hnsw (embedding vector_cosine_ops)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_enroll_vector")
    op.execute("DROP INDEX IF EXISTS idx_enroll_active_emp")
    op.drop_index("idx_enrollments_plant_id", table_name="enrollments")
    op.drop_index("idx_enrollments_employee_id", table_name="enrollments")
    op.drop_table("enrollments")
    op.drop_index("idx_employees_plant", table_name="employees")
    op.drop_table("employees")
    op.drop_table("plants")
    # Keep the vector extension installed; other objects may depend on it later.
