"""Registration-first self-enroll: drop employee FK, add submitted_full_name.

Path A no longer requires a pre-existing employees row at POST /register.
HR validates offline; employee + enrollment are created on admin APPROVE.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260829_0005"
down_revision: Union[str, Sequence[str], None] = "20260829_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "registration_requests_employee_id_fkey",
        "registration_requests",
        type_="foreignkey",
    )
    op.add_column(
        "registration_requests",
        sa.Column(
            "submitted_full_name",
            sa.Text(),
            nullable=False,
            server_default="",
        ),
    )
    op.alter_column(
        "registration_requests",
        "submitted_full_name",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("registration_requests", "submitted_full_name")
    op.create_foreign_key(
        "registration_requests_employee_id_fkey",
        "registration_requests",
        "employees",
        ["employee_id"],
        ["employee_id"],
    )
