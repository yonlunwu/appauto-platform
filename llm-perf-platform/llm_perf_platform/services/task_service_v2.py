from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel
from sqlmodel import select

from llm_perf_platform.models.db import get_session
from llm_perf_platform.models.task_record import TaskRecord


@contextmanager
def session_scope():
    session = get_session()
    try:
        yield session
    finally:
        session.close()


class TaskService:
    """Encapsulates CRUD operations for TaskRecord objects."""

    def create_task(
        self,
        *,
        engine: str,
        model: str,
        parameters: Union[Dict[str, Any], BaseModel],  # ← 接受 Model 或 dict
        status: str = "queued",
        ssh_config: Optional[Dict[str, Any]] = None,
        user_id: Optional[int] = None,
        appauto_branch: str = "main",
        task_type: str = "perf_test",
    ) -> TaskRecord:
        """创建新任务记录

        Args:
            engine: 测试引擎（如 sglang, evalscope 等）
            model: 模型名称
            parameters: 任务参数（Pydantic Model 或 dict，内部自动转换）
            status: 初始状态，默认为 "queued"
            ssh_config: SSH 配置（远程执行时需要）
            user_id: 创建用户ID
            appauto_branch: Appauto 分支版本（默认为 main）
            task_type: 任务类型（如 perf_test, hardware_info 等），默认为 perf_test

        Returns:
            TaskRecord: 创建的任务记录
        """
        # ← 关键改进：统一在此处转换，调用方无需关心
        if isinstance(parameters, BaseModel):
            parameters = parameters.model_dump(exclude_none=True)

        with session_scope() as session:
            record = TaskRecord(
                engine=engine,
                model=model,
                parameters=parameters,
                status=status,
                ssh_config=ssh_config,
                user_id=user_id,
                appauto_branch=appauto_branch,
                task_type=task_type,
            )
            session.add(record)
            session.commit()
            session.refresh(record)

            # Set display_id to be the same as id after commit
            record.display_id = record.id
            session.add(record)
            session.commit()
            session.refresh(record)

            return record

    def mark_running(self, task_id: int) -> None:
        """标记任务为运行中状态"""
        self._update_task(task_id, {"status": "running"})

    def mark_completed(
        self,
        task_id: int,
        result_path: str,
        summary: Dict[str, Any],
    ) -> None:
        """标记任务为完成状态"""
        self._update_task(
            task_id,
            {
                "status": "completed",
                "result_path": result_path,
                "summary": summary,
            },
            set_completed=True,
        )

    def mark_failed(self, task_id: int, error_message: str) -> None:
        """标记任务为失败状态"""
        self._update_task(
            task_id,
            {
                "status": "failed",
                "error_message": error_message,
            },
            set_completed=True,
        )

    def mark_cancelled(self, task_id: int) -> None:
        """标记任务为已取消状态"""
        self._update_task(
            task_id,
            {
                "status": "cancelled",
                "error_message": "Task cancelled by user",
            },
            set_completed=True,
        )

    def attach_archive(self, task_id: int, archived_path: str) -> TaskRecord:
        """附加归档路径到任务记录"""
        with session_scope() as session:
            record = session.get(TaskRecord, task_id)
            if not record:
                raise ValueError(f"Task {task_id} not found")
            record.archived_path = archived_path
            record.result_path = archived_path
            session.add(record)
            session.commit()
            session.refresh(record)
            return record

    def clear_archive(self, task_id: int) -> None:
        """清除任务的归档路径"""
        self._update_task(task_id, {"archived_path": None})

    def list_tasks(self, limit: int = 100) -> List[TaskRecord]:
        """获取任务列表"""
        with session_scope() as session:
            statement = (
                select(TaskRecord)
                .order_by(TaskRecord.created_at.desc())
                .limit(limit)
            )
            return list(session.exec(statement))

    def list_tasks_paginated(
        self,
        page: int = 1,
        page_size: int = 20,
        user_id: Optional[int] = None,
        task_type: Optional[str] = None,
    ) -> tuple[List[TaskRecord], int]:
        """获取分页任务列表"""
        with session_scope() as session:
            statement = select(TaskRecord)
            if user_id is not None:
                statement = statement.where(TaskRecord.user_id == user_id)
            if task_type is not None:
                statement = statement.where(TaskRecord.task_type == task_type)

            from sqlalchemy import func
            count_statement = select(func.count()).select_from(TaskRecord)
            if user_id is not None:
                count_statement = count_statement.where(TaskRecord.user_id == user_id)
            if task_type is not None:
                count_statement = count_statement.where(TaskRecord.task_type == task_type)
            total = session.exec(count_statement).one()

            offset = (page - 1) * page_size
            statement = (
                statement
                .order_by(TaskRecord.created_at.desc())
                .offset(offset)
                .limit(page_size)
            )

            tasks = list(session.exec(statement))
            return tasks, total

    def list_tasks_by_status(self, status: str, limit: int = 100) -> List[TaskRecord]:
        """根据状态获取任务列表"""
        with session_scope() as session:
            statement = (
                select(TaskRecord)
                .where(TaskRecord.status == status)
                .order_by(TaskRecord.created_at.desc())
                .limit(limit)
            )
            return list(session.exec(statement))

    def list_tasks_by_engine(self, engine: str, limit: int = 100) -> List[TaskRecord]:
        """根据引擎类型获取任务列表"""
        with session_scope() as session:
            statement = (
                select(TaskRecord)
                .where(TaskRecord.engine == engine)
                .order_by(TaskRecord.created_at.desc())
                .limit(limit)
            )
            return list(session.exec(statement))

    def count_tasks_by_status(self, status: str) -> int:
        """统计指定状态的任务数量"""
        with session_scope() as session:
            from sqlalchemy import func
            statement = select(func.count()).select_from(TaskRecord).where(TaskRecord.status == status)
            return session.exec(statement).one()

    def get_task(self, task_id: int) -> Optional[TaskRecord]:
        """根据ID获取任务记录"""
        with session_scope() as session:
            return session.get(TaskRecord, task_id)

    def delete_task(self, task_id: int) -> Optional[TaskRecord]:
        """删除任务记录"""
        with session_scope() as session:
            record = session.get(TaskRecord, task_id)
            if not record:
                return None
            session.delete(record)
            session.commit()
            return record

    def _update_task(
        self,
        task_id: int,
        values: Dict[str, Any],
        *,
        set_completed: bool = False,
    ) -> None:
        """更新任务记录（内部方法）"""
        with session_scope() as session:
            record = session.get(TaskRecord, task_id)
            if not record:
                return
            for key, value in values.items():
                setattr(record, key, value)
            if set_completed:
                from datetime import datetime
                record.completed_at = datetime.now()
                if values.get("status") == "completed":
                    record.error_message = None
            session.add(record)
            session.commit()
