"""系统管理 API

提供系统维护功能，如更新 appauto 代码和虚拟环境
"""
import os
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from llm_perf_platform.api.auth import get_current_user
from llm_perf_platform.models.user_account import UserAccount
from llm_perf_platform.services.task_service import TaskService


router = APIRouter(prefix="/system")
task_service = TaskService()


class UpdateAppautoRequest(BaseModel):
    """更新 appauto 请求"""
    branch: str


class AppautoVersionInfo(BaseModel):
    """Appauto 版本信息"""
    branch: str
    venv_path: str
    version: str | None = None
    exists: bool


class AppautoVersionsResponse(BaseModel):
    """Appauto 版本列表响应"""
    versions: List[AppautoVersionInfo]
    appauto_path: str


def get_admin_user(current_user: UserAccount = Depends(get_current_user)) -> UserAccount:
    """获取管理员用户（依赖注入）

    检查当前用户是否为管理员，如果不是则抛出 403 错误
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="admin_required"
        )

    return current_user


@router.get("/appauto/versions", response_model=AppautoVersionsResponse)
def get_appauto_versions(current_user: UserAccount = Depends(get_admin_user)):
    """获取已安装的 appauto 版本列表

    扫描 ~/.local/share/llm-perf/venvs/ 目录，返回所有已安装的 appauto 版本
    """
    appauto_path = Path(os.getenv("APPAUTO_PATH", "/Users/ryanyang/work/approaching/code/appauto"))
    venv_base_path = Path.home() / ".local/share/llm-perf/venvs"

    versions = []

    if venv_base_path.exists():
        for venv_dir in venv_base_path.iterdir():
            if venv_dir.is_dir() and venv_dir.name.startswith("appauto-"):
                branch = venv_dir.name.replace("appauto-", "")
                venv_path = venv_dir / ".venv"

                version_info = AppautoVersionInfo(
                    branch=branch,
                    venv_path=str(venv_path),
                    exists=venv_path.exists()
                )

                # 尝试获取版本号
                if venv_path.exists():
                    appauto_bin = venv_path / "bin" / "appauto"
                    if appauto_bin.exists():
                        try:
                            import subprocess
                            result = subprocess.run(
                                [str(appauto_bin), "--version"],
                                capture_output=True,
                                text=True,
                                timeout=5
                            )
                            if result.returncode == 0:
                                version_info.version = result.stdout.strip()
                        except Exception:
                            pass

                versions.append(version_info)

    return AppautoVersionsResponse(
        versions=versions,
        appauto_path=str(appauto_path)
    )


@router.post("/appauto/update")
def update_appauto(
    request: UpdateAppautoRequest,
    current_user: UserAccount = Depends(get_admin_user)
):
    """更新 appauto 代码和虚拟环境

    创建一个系统维护任务，异步执行更新操作
    """
    # 创建系统维护任务
    record = task_service.create_task(
        engine="system",
        model="appauto_update",
        parameters={
            "operation": "update_appauto",
            "branch": request.branch,
        },
        status="queued",
        user_id=current_user.id,
        task_type="system_maintenance",
    )

    return {
        "task_id": record.id,
        "display_id": record.display_id,
        "uuid": record.uuid,
        "status": record.status,
        "message": f"系统维护任务已创建，正在更新 appauto 分支: {request.branch}"
    }


# ========== 用户管理 API ==========

class UserInfo(BaseModel):
    """用户信息"""
    id: int
    email: str
    role: str
    created_at: str


class UserListResponse(BaseModel):
    """用户列表响应"""
    users: List[UserInfo]
    total: int


class UpdateUserRoleRequest(BaseModel):
    """更新用户角色请求"""
    role: str  # "admin" 或 "user"


class ResetPasswordRequest(BaseModel):
    """重置用户密码请求"""
    new_password: str


@router.get("/users", response_model=UserListResponse)
def list_users(current_user: UserAccount = Depends(get_admin_user)):
    """获取所有用户列表

    只有管理员可以访问
    """
    from llm_perf_platform.models.db import get_session
    from sqlmodel import select

    with get_session() as session:
        users = session.exec(select(UserAccount)).all()

        user_list = [
            UserInfo(
                id=user.id,
                email=user.email,
                role=user.role,
                created_at=user.created_at.isoformat()
            )
            for user in users
        ]

        return UserListResponse(
            users=user_list,
            total=len(user_list)
        )


@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    request: UpdateUserRoleRequest,
    current_user: UserAccount = Depends(get_admin_user)
):
    """更新用户角色

    只有管理员可以访问
    Args:
        user_id: 要更新的用户 ID
        request: 包含新角色的请求体
    """
    from llm_perf_platform.models.db import get_session

    # 验证角色值
    if request.role not in ("admin", "user"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid_role"
        )

    # 不能修改自己的角色
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="cannot_modify_own_role"
        )

    with get_session() as session:
        user = session.get(UserAccount, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="user_not_found"
            )

        user.role = request.role
        session.add(user)
        session.commit()
        session.refresh(user)

        return {
            "user_id": user.id,
            "email": user.email,
            "role": user.role,
            "message": f"用户角色已更新为: {request.role}"
        }


@router.put("/users/{user_id}/password")
def reset_user_password(
    user_id: int,
    request: ResetPasswordRequest,
    current_user: UserAccount = Depends(get_admin_user)
):
    """重置用户密码

    只有管理员可以访问
    重置密码后，该用户的所有登录会话将被清除，需要重新登录

    Args:
        user_id: 要重置密码的用户 ID
        request: 包含新密码的请求体
    """
    from llm_perf_platform.services.auth_service import AuthService

    # 验证密码长度
    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="password_too_short"
        )

    auth_service = AuthService()

    try:
        user = auth_service.reset_user_password(user_id, request.new_password)
        return {
            "user_id": user.id,
            "email": user.email,
            "message": f"用户 {user.email} 的密码已重置，所有登录会话已清除"
        }
    except ValueError as e:
        if str(e) == "user_not_found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="user_not_found"
            )
        raise


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: UserAccount = Depends(get_admin_user)
):
    """删除用户

    只有管理员可以访问
    不能删除自己
    Args:
        user_id: 要删除的用户 ID
    """
    from llm_perf_platform.models.db import get_session
    from llm_perf_platform.models.user_account import SessionToken

    # 不能删除自己
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="cannot_delete_self"
        )

    with get_session() as session:
        user = session.get(UserAccount, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="user_not_found"
            )

        # 删除用户的所有 session token
        from sqlmodel import select
        tokens = session.exec(
            select(SessionToken).where(SessionToken.user_id == user_id)
        ).all()
        for token in tokens:
            session.delete(token)

        # 删除用户
        session.delete(user)
        session.commit()

        return {
            "user_id": user_id,
            "email": user.email,
            "message": f"用户 {user.email} 已删除"
        }


class BatchDeleteUsersRequest(BaseModel):
    """批量删除用户请求"""
    user_ids: List[int]


@router.post("/users/batch-delete")
def batch_delete_users(
    request: BatchDeleteUsersRequest,
    current_user: UserAccount = Depends(get_admin_user)
):
    """批量删除用户

    只有管理员可以访问
    不能删除自己
    Args:
        request: 包含要删除的用户 ID 列表
    """
    from llm_perf_platform.models.db import get_session
    from llm_perf_platform.models.user_account import SessionToken
    from sqlmodel import select

    # 检查是否尝试删除自己
    if current_user.id in request.user_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="cannot_delete_self"
        )

    deleted_users = []
    not_found_ids = []

    with get_session() as session:
        for user_id in request.user_ids:
            user = session.get(UserAccount, user_id)
            if not user:
                not_found_ids.append(user_id)
                continue

            # 删除用户的所有 session token
            tokens = session.exec(
                select(SessionToken).where(SessionToken.user_id == user_id)
            ).all()
            for token in tokens:
                session.delete(token)

            # 删除用户
            deleted_users.append({"id": user.id, "email": user.email})
            session.delete(user)

        session.commit()

    return {
        "deleted_count": len(deleted_users),
        "deleted_users": deleted_users,
        "not_found_ids": not_found_ids,
        "message": f"成功删除 {len(deleted_users)} 个用户"
    }
