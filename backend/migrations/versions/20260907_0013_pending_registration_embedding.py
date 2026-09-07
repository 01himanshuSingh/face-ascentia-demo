"""Store SFace embedding on registration_requests for PENDING duplicate gate.

Path A previously only compared against ACTIVE enrollments, so the same face
could submit multiple PENDING rows under different employee_ids. Persist the
vector computed at register time and index PENDING rows for plant-scoped 1:N.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "20260907_0013"
down_revision: Union[str, Sequence[str], None] = "20260905_0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMBEDDING_DIMENSIONS = 128


def upgrade() -> None:
    op.add_column(
        "registration_requests",
        sa.Column("embedding", Vector(EMBEDDING_DIMENSIONS), nullable=True),
    )
    # Partial HNSW: only PENDING rows with a stored vector (legacy NULL skipped).
    op.execute(
        sa.text(
            """
            CREATE INDEX idx_reqs_pending_vector
            ON registration_requests
            USING hnsw (embedding vector_cosine_ops)
            WHERE status = 'PENDING' AND embedding IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS idx_reqs_pending_vector"))
    op.drop_column("registration_requests", "embedding")
