"""add_user_role_field

Revision ID: 9dc726cfd3c2
Revises: e058d74cbbab
Create Date: 2025-12-11 17:25:37.187409

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9dc726cfd3c2'
down_revision: Union[str, Sequence[str], None] = 'e058d74cbbab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add role column with default value 'user'
    op.add_column('useraccount', sa.Column('role', sa.String(), nullable=False, server_default='user'))
    # Create index on role
    op.create_index(op.f('ix_useraccount_role'), 'useraccount', ['role'], unique=False)

    # Create default admin user if not exists
    # Note: This will be handled in application startup instead to ensure proper password hashing


def downgrade() -> None:
    """Downgrade schema."""
    # Drop index
    op.drop_index(op.f('ix_useraccount_role'), table_name='useraccount')
    # Drop column
    op.drop_column('useraccount', 'role')
