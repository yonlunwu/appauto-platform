from typing import Optional, Dict, Any
from datetime import datetime
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field


class TaskRecord(SQLModel, table=True):
    """任务记录模型

    记录测试任务的完整信息，包括参数、状态、结果等。

    状态流转：
    - pending/queued: 待执行
    - running: 执行中
    - completed: 执行成功
    - failed: 执行失败
    """

    # 保留原有自增ID作为主键（向后兼容）
    id: Optional[int] = Field(default=None, primary_key=True)

    # UUID 字段，保证全局唯一性
    uuid: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        index=True,
        unique=True,
        description="任务唯一标识符（UUID）"
    )

    # 显示 ID，与 id 相同，用于用户友好的展示
    # 在未来可以作为独立的显示序号
    display_id: Optional[int] = Field(
        default=None,
        index=True,
        description="显示序号（用户友好）"
    )

    engine: str = Field(index=True, description="测试引擎，如 sglang, evalscope 等")
    model: str = Field(index=True, description="模型名称")

    task_type: str = Field(default="perf_test", index=True, description="任务类型，如 perf_test, hardware_info 等")

    user_id: Optional[int] = Field(default=None, index=True, description="创建用户 ID")

    appauto_branch: Optional[str] = Field(
        default="main",
        index=True,
        description="Appauto 分支版本（如 main, v3.3.1）"
    )

    parameters: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="任务参数（JSON 格式）"
    )

    status: str = Field(default="pending", description="任务状态")

    result_path: Optional[str] = Field(default=None, description="结果文件路径")
    archived_path: Optional[str] = Field(default=None, description="归档文件路径")

    summary: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="任务执行摘要（JSON 格式）"
    )

    error_message: Optional[str] = Field(default=None, description="错误信息")

    # SSH remote execution configuration
    ssh_config: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="SSH 远程执行配置（JSON 格式）"
    )

    created_at: datetime = Field(default_factory=datetime.utcnow, description="创建时间")
    completed_at: Optional[datetime] = Field(default=None, description="完成时间")

    @property
    def is_pending(self) -> bool:
        """是否为待执行状态"""
        return self.status in ("pending", "queued")

    @property
    def is_running(self) -> bool:
        """是否为运行中状态"""
        return self.status == "running"

    @property
    def is_completed(self) -> bool:
        """是否已完成（成功或失败）"""
        return self.status in ("completed", "failed")

    @property
    def is_success(self) -> bool:
        """是否执行成功"""
        return self.status == "completed"

    @property
    def is_failed(self) -> bool:
        """是否执行失败"""
        return self.status == "failed"

    @property
    def duration_seconds(self) -> Optional[float]:
        """任务执行时长（秒）"""
        if self.completed_at and self.created_at:
            return (self.completed_at - self.created_at).total_seconds()
        return None

    def get_parameter(self, key: str, default: Any = None) -> Any:
        """获取参数值

        Args:
            key: 参数键名
            default: 默认值

        Returns:
            参数值，如果不存在则返回默认值
        """
        return self.parameters.get(key, default)

    def get_summary_value(self, key: str, default: Any = None) -> Any:
        """获取摘要中的值

        Args:
            key: 摘要键名
            default: 默认值

        Returns:
            摘要值，如果不存在则返回默认值
        """
        if not self.summary:
            return default
        return self.summary.get(key, default)
