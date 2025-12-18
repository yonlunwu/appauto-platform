"""Initial migration with user_id field

Revision ID: 3123e7766f8a
Revises:
Create Date: 2025-12-09 15:24:01.427789

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3123e7766f8a'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - create all initial tables."""
    # Create useraccount table
    op.create_table(
        'useraccount',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False, server_default='user'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_useraccount_email'), 'useraccount', ['email'], unique=True)

    # Create taskrecord table
    op.create_table(
        'taskrecord',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.String(), nullable=False),
        sa.Column('task_type', sa.String(), nullable=False, server_default='benchmark'),
        sa.Column('task_name', sa.String(), nullable=False),
        sa.Column('appauto_branch', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('config', sa.JSON(), nullable=True),
        sa.Column('result', sa.JSON(), nullable=True),
        sa.Column('start_time', sa.DateTime(), nullable=True),
        sa.Column('end_time', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['useraccount.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_taskrecord_task_id'), 'taskrecord', ['task_id'], unique=True)

    # Create modelinstance table
    op.create_table(
        'modelinstance',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('model_name', sa.String(), nullable=False),
        sa.Column('engine', sa.String(), nullable=False),
        sa.Column('server_url', sa.String(), nullable=False),
        sa.Column('gpu_memory_gb', sa.Integer(), nullable=True),
        sa.Column('tensor_parallel_size', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('status', sa.String(), nullable=False, server_default='unknown'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_modelinstance_name'), 'modelinstance', ['name'], unique=True)


def downgrade() -> None:
    """Downgrade schema - drop all tables."""
    op.drop_index(op.f('ix_modelinstance_name'), table_name='modelinstance')
    op.drop_table('modelinstance')
    op.drop_index(op.f('ix_taskrecord_task_id'), table_name='taskrecord')
    op.drop_table('taskrecord')
    op.drop_index(op.f('ix_useraccount_email'), table_name='useraccount')
    op.drop_table('useraccount')
