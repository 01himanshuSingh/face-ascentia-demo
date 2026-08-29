"""Restore optional kiosk_id on registration_requests.

Future-ready: nullable column accepts kiosk device id when the fleet registry
ships; registration API and service may omit it until then (no default required).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260829_0004"
down_revision: Union[str, Sequence[str], None] = "20260829_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "registration_requests",
        sa.Column("kiosk_id", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("registration_requests", "kiosk_id")
