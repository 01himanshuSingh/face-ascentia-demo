"""V1 RBAC cleanup: PLANT_ADMIN registration-only permissions (no SUB_ADMIN grant)."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260831_0007"
down_revision: Union[str, Sequence[str], None] = "20260831_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            DELETE FROM admin_role_permissions
            WHERE permission_code = 'ADMIN_GRANT_SUB_ADMIN'
            """
        )
    )


def downgrade() -> None:
    pass
