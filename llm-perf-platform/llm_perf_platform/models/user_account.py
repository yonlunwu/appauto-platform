from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class UserAccount(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    role: str = Field(default="user", index=True, description="用户角色：admin 或 user")
    created_at: datetime = Field(default_factory=datetime.now)


class SessionToken(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="useraccount.id", index=True)
    token: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=datetime.now)

