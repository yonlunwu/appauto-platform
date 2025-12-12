"""add_task_type_column

Revision ID: e058d74cbbab
Revises: 5b58aff1ebc9
Create Date: 2025-12-11 13:58:13.169808

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e058d74cbbab'
down_revision: Union[str, Sequence[str], None] = '5b58aff1ebc9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add task_type column with default value 'perf_test'
    op.add_column('taskrecord', sa.Column('task_type', sa.String(), nullable=False, server_default='perf_test'))
    # Create index on task_type
    op.create_index(op.f('ix_taskrecord_task_type'), 'taskrecord', ['task_type'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    # Drop index
    op.drop_index(op.f('ix_taskrecord_task_type'), table_name='taskrecord')
    # Drop column
    op.drop_column('taskrecord', 'task_type')
