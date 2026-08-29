"""Defer kiosk_id; drop employees.department.

System design (YAGNI)
---------------------
- kiosk_id on registration_requests: removed until kiosk fleet registry exists
  (~70 kiosks). Avoids nullable dead column and API fields with no data source.
  Re-add via future migration when kiosk_id is defined (plant + device binding).

- employees.department: removed — not used by auth, registration, or Week 2 flows.
  Org structure stays in Mendix/HR; face-auth DB keeps identity + plant scope only.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260829_0003"
down_revision: Union[str, Sequence[str], None] = "20260829_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("registration_requests", "kiosk_id")
    op.drop_column("employees", "department")


def downgrade() -> None:
    op.add_column(
        "employees",
        sa.Column("department", sa.Text(), nullable=True),
    )
    op.add_column(
        "registration_requests",
        sa.Column("kiosk_id", sa.Text(), nullable=True),
    )
