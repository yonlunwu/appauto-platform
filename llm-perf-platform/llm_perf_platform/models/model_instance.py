"""模型实例数据模型 - 跟踪已启动的模型实例"""
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field


class ModelStatus(str, Enum):
    """模型实例状态"""
    PENDING = "pending"          # 等待启动
    LOADING = "loading"          # 正在加载
    RUNNING = "running"          # 运行中
    STOPPED = "stopped"          # 已停止
    ERROR = "error"              # 错误状态
    HEALTH_CHECK_FAILED = "health_check_failed"  # 健康检查失败


class ModelInstance(SQLModel, table=True):
    """模型实例表

    跟踪所有已启动的模型实例，包括本地和远程实例
    """

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # 模型元信息
    model_name: str = Field(index=True)  # 模型名称 (e.g., "Qwen2.5-7B-Instruct")
    model_family: str = Field(index=True)  # 模型家族 (e.g., "qwen")
    model_type: str = Field(default="llm")  # 模型类型 (e.g., "llm")

    # 运行时配置
    engine: str = Field(index=True)  # 引擎名称 (vllm/sglang/ftransformers)
    tp: int = Field(default=1)  # Tensor Parallelism 并行度
    mode: str = Field(default="correct")  # 运行模式 (correct/perf)
    scenario: str = Field(default="amaas", index=True)  # 测试场景 (amaas/ft)

    # 模型路径
    model_path: str  # 模型完整路径 (用户自定义或默认路径)

    # 网络配置
    host: str = Field(default="0.0.0.0")  # 监听地址
    port: int = Field(index=True)  # 监听端口
    endpoint: Optional[str] = None  # API endpoint URL (e.g., "http://192.168.1.100:30000/v1")

    # 进程信息
    pid: Optional[int] = None  # 进程ID (仅本地实例)

    # 状态跟踪
    status: str = Field(default=ModelStatus.PENDING, index=True)  # 当前状态
    error_message: Optional[str] = None  # 错误信息

    # SSH远程配置 (如果是远程实例)
    ssh_config: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True)
    )
    # ssh_config 结构示例:
    # {
    #     "host": "192.168.1.100",
    #     "port": 22,
    #     "username": "user",
    #     "password": "xxx",  # 可选
    #     "key_path": "/path/to/key",  # 可选
    # }

    # 启动命令和参数
    launch_command: Optional[str] = None  # 完整启动命令
    launch_params: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True)
    )  # 启动参数字典

    # 硬件资源信息
    gpu_memory_gb: Optional[int] = None  # 预估显存需求 (GB)
    gpu_ids: Optional[str] = None  # 使用的GPU ID (e.g., "0,1,2,3")

    # 健康检查
    last_health_check: Optional[datetime] = None  # 上次健康检查时间
    health_check_failures: int = Field(default=0)  # 连续健康检查失败次数

    # 时间戳
    created_at: datetime = Field(default_factory=datetime.now)  # 创建时间
    started_at: Optional[datetime] = None  # 启动时间
    stopped_at: Optional[datetime] = None  # 停止时间
    updated_at: datetime = Field(default_factory=datetime.now)  # 更新时间

    # 用户信息
    created_by: Optional[str] = None  # 创建者用户名

    # 额外元数据
    extra_metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True)
    )  # 额外的元数据信息（metadata是保留字段，使用extra_metadata）

    @property
    def is_remote(self) -> bool:
        """是否为远程实例"""
        return self.ssh_config is not None

    @property
    def is_running(self) -> bool:
        """是否正在运行"""
        return self.status == ModelStatus.RUNNING

    @property
    def is_stopped(self) -> bool:
        """是否已停止"""
        return self.status in [ModelStatus.STOPPED, ModelStatus.ERROR]

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典（用于API响应）"""
        return {
            "id": self.id,
            "model_name": self.model_name,
            "model_family": self.model_family,
            "model_type": self.model_type,
            "engine": self.engine,
            "tp": self.tp,
            "mode": self.mode,
            "scenario": self.scenario,
            "model_path": self.model_path,
            "host": self.host,
            "port": self.port,
            "endpoint": self.endpoint,
            "pid": self.pid,
            "status": self.status,
            "error_message": self.error_message,
            "ssh_config": self.ssh_config,
            "launch_command": self.launch_command,
            "gpu_memory_gb": self.gpu_memory_gb,
            "gpu_ids": self.gpu_ids,
            "last_health_check": self.last_health_check.isoformat() if self.last_health_check else None,
            "health_check_failures": self.health_check_failures,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "stopped_at": self.stopped_at.isoformat() if self.stopped_at else None,
            "updated_at": self.updated_at.isoformat(),
            "created_by": self.created_by,
            "is_remote": self.is_remote,
            "is_running": self.is_running,
            "is_stopped": self.is_stopped,
        }
