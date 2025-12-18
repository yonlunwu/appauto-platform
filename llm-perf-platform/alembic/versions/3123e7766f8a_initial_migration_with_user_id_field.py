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
    op.create_index(op.f('ix_useraccount_role'), 'useraccount', ['role'], unique=False)

    # Create taskrecord table
    op.create_table(
        'taskrecord',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('uuid', sa.String(), nullable=False),
        sa.Column('display_id', sa.Integer(), nullable=True),
        sa.Column('engine', sa.String(), nullable=False),
        sa.Column('model', sa.String(), nullable=False),
        sa.Column('task_type', sa.String(), nullable=False, server_default='perf_test'),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('appauto_branch', sa.String(), nullable=True, server_default='main'),
        sa.Column('parameters', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('result_path', sa.String(), nullable=True),
        sa.Column('archived_path', sa.String(), nullable=True),
        sa.Column('summary', sa.JSON(), nullable=True),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('ssh_config', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_taskrecord_uuid'), 'taskrecord', ['uuid'], unique=True)
    op.create_index(op.f('ix_taskrecord_display_id'), 'taskrecord', ['display_id'], unique=False)
    op.create_index(op.f('ix_taskrecord_engine'), 'taskrecord', ['engine'], unique=False)
    op.create_index(op.f('ix_taskrecord_model'), 'taskrecord', ['model'], unique=False)
    op.create_index(op.f('ix_taskrecord_task_type'), 'taskrecord', ['task_type'], unique=False)
    op.create_index(op.f('ix_taskrecord_user_id'), 'taskrecord', ['user_id'], unique=False)
    op.create_index(op.f('ix_taskrecord_appauto_branch'), 'taskrecord', ['appauto_branch'], unique=False)

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
    op.drop_index(op.f('ix_taskrecord_appauto_branch'), table_name='taskrecord')
    op.drop_index(op.f('ix_taskrecord_user_id'), table_name='taskrecord')
    op.drop_index(op.f('ix_taskrecord_task_type'), table_name='taskrecord')
    op.drop_index(op.f('ix_taskrecord_model'), table_name='taskrecord')
    op.drop_index(op.f('ix_taskrecord_engine'), table_name='taskrecord')
    op.drop_index(op.f('ix_taskrecord_display_id'), table_name='taskrecord')
    op.drop_index(op.f('ix_taskrecord_uuid'), table_name='taskrecord')
    op.drop_table('taskrecord')
    op.drop_index(op.f('ix_useraccount_role'), table_name='useraccount')
    op.drop_index(op.f('ix_useraccount_email'), table_name='useraccount')
    op.drop_table('useraccount')
