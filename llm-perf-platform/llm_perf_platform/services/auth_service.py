from __future__ import annotations

import secrets
from typing import Optional

import bcrypt
from sqlmodel import select

from llm_perf_platform.models.db import get_session
from llm_perf_platform.models.user_account import SessionToken, UserAccount


class AuthService:
    def register_user(self, email: str, password: str) -> UserAccount:
        with get_session() as session:
            existing = session.exec(
                select(UserAccount).where(UserAccount.email == email)
            ).first()
            if existing:
                raise ValueError("email_already_exists")

            password_hash = self._hash_password(password)
            user = UserAccount(email=email, password_hash=password_hash)
            session.add(user)
            session.commit()
            session.refresh(user)
            return user

    def authenticate(self, email: str, password: str) -> Optional[UserAccount]:
        with get_session() as session:
            user = session.exec(
                select(UserAccount).where(UserAccount.email == email)
            ).first()
            if not user:
                return None
            if not self._verify_password(password, user.password_hash):
                return None
            return user

    def create_token(self, user_id: int) -> SessionToken:
        token_value = secrets.token_hex(32)
        with get_session() as session:
            token = SessionToken(user_id=user_id, token=token_value)
            session.add(token)
            session.commit()
            session.refresh(token)
            return token

    def get_user_by_token(self, token_value: str) -> Optional[UserAccount]:
        with get_session() as session:
            token = session.exec(
                select(SessionToken).where(SessionToken.token == token_value)
            ).first()
            if not token:
                return None
            return session.get(UserAccount, token.user_id)

    def _hash_password(self, password: str) -> str:
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    def _verify_password(self, password: str, hashed: str) -> bool:
        try:
            return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
        except ValueError:
            return False

    def ensure_default_admin(self, email: str = "admin@example.com", password: str = "admin123") -> None:
        """确保存在默认管理员账号

        如果数据库中没有任何管理员账号，则创建一个默认管理员。

        Args:
            email: 默认管理员邮箱
            password: 默认管理员密码
        """
        with get_session() as session:
            # 检查是否已存在管理员
            admin_exists = session.exec(
                select(UserAccount).where(UserAccount.role == "admin")
            ).first()

            if not admin_exists:
                # 创建默认管理员
                password_hash = self._hash_password(password)
                admin = UserAccount(
                    email=email,
                    password_hash=password_hash,
                    role="admin"
                )
                session.add(admin)
                session.commit()
                import logging
                logger = logging.getLogger(__name__)
                logger.info(f"Default admin user created: {email}")

