from datetime import datetime
from typing import Any, Dict, List, Optional, Literal

from pydantic import BaseModel, EmailStr, Field


class SSHConfig(BaseModel):
    host: str
    port: int = 22
    user: str
    auth_type: Literal["password", "key"] = "key"
    password: Optional[str] = None
    private_key_path: Optional[str] = None
    passphrase: Optional[str] = None
    timeout: int = 30


class TestRunRequest(BaseModel):
    engine: str
    model: str
    input_length: int = Field(gt=0)
    output_length: int = Field(gt=0)
    concurrency: int = Field(gt=0)
    loop: int = Field(default=1, gt=0)
    warmup: bool = False
    ssh_config: Optional[SSHConfig] = None
    execution_mode: Literal["local", "remote"] = "remote"  # 默认远程执行
    scenario: Literal["amaas", "ft"] = "ft"  # 测试场景：AMaaS或ft容器

    # Appauto 版本配置
    appauto_branch: str = "main"  # Appauto 分支版本（如 main, v3.3.1）

    # 模型启动配置
    auto_launch_model: bool = False  # 是否自动启动模型
    model_config_name: Optional[str] = None  # 模型名称
    model_path: Optional[str] = None  # 自定义模型完整路径
    model_tp: int = Field(default=1, gt=0)  # Tensor Parallelism
    model_mode: str = "correct"  # 模型运行模式（correct/perf）
    model_port: int = Field(default=30000, ge=1024, le=65535)  # 模型监听端口
    model_host: str = "0.0.0.0"  # 模型监听地址
    stop_model_after_test: bool = False  # 测试完成后是否停止模型

    # AMaaS API 配置
    amaas_api_port: int = Field(default=10001, ge=1024, le=65535)  # AMaaS API 端口
    amaas_api_user: str = "admin"  # AMaaS API 用户名
    amaas_api_passwd: str = "123456"  # AMaaS API 密码


class BaseTestPerf(BaseModel):
    base: Literal["amaas", "ft"]

    skip_launch: bool

    ip: str
    port: int = Field(gt=0)

    model: Optional[str]
    tokenizer_path: Optional[str] = None

    ssh_user: str = "qujing"
    ssh_password: Optional[str] = None
    ssh_port: int = Field(default=22, gt=0)

    parallel: str = '1 4'
    number: str = '1 4'
    input_length: int = Field(default=128, gt=0)
    output_length: int = Field(default=512, gt=0)

    loop: int = Field(default=1, gt=0)
    debug: bool = False
    warmup: bool = False

    keep_model: bool = True

    tp: Literal[1, 2, 4, 8] = 1

    # 测试超时配置
    timeout_minutes: Optional[float] = Field(default=30.0, gt=0, description="测试超时时间（分钟）")

    # Appauto 版本配置
    appauto_branch: str = "main"  # Appauto 分支版本（如 main, v3.3.1）

class TestPerfViaAMaaSSkipLaunch(BaseTestPerf):
    base: Literal["amaas"] = 'amaas'
    skip_launch: bool = True
    port: int = 10011

class TestPerfViaAmaaSWithLaunch(BaseTestPerf):
    base: Literal["amaas"] = 'amaas'
    skip_launch: bool = False
    port: int = 10011

class TestPerfViaFTSkipLaunch(BaseTestPerf):
    base: Literal["ft"] = 'ft'
    skip_launch: bool = True

class TestPerfViaFTWithLaunch(BaseTestPerf):
    base: Literal["ft"] = 'ft'
    skip_launch: bool = False
    tp: Literal[1, 2, 4, 8] = 1
    launch_timeout: int = Field(default=900, gt=0)


class TestRunResponse(BaseModel):
    task_id: int
    status: str
    concurrency: int


class TaskSummary(BaseModel):
    id: int
    uuid: str  # Task UUID for global uniqueness
    display_id: Optional[int] = None  # User-friendly display ID
    engine: str
    model: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    result_path: Optional[str] = None
    archived_path: Optional[str] = None
    error_message: Optional[str] = None
    parameters: Dict[str, Any]
    summary: Optional[Dict[str, Any]] = None
    ssh_config: Optional[Dict[str, Any]] = None
    user_id: Optional[int] = None
    user_email: Optional[str] = None


class TaskListResponse(BaseModel):
    items: List[TaskSummary]
    total: int = 0
    page: int = 1
    page_size: int = 20
    total_pages: int = 0


class TaskDetailResponse(TaskSummary):
    pass


class ArchiveRequest(BaseModel):
    task_id: int


class ArchiveResponse(BaseModel):
    task_id: int
    archived_path: str


class DeleteTaskResponse(BaseModel):
    deleted: bool


class CancelTaskResponse(BaseModel):
    task_id: int
    cancelled: bool
    message: str


class RetryTaskResponse(BaseModel):
    task_id: int
    new_task_id: int
    status: str
    message: str


class TaskLogsResponse(BaseModel):
    task_id: int
    logs: str
    log_file_path: Optional[str] = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    user_id: int
    email: EmailStr
    token: str


class ProfileResponse(BaseModel):
    user_id: int
    email: EmailStr
    role: str  # "admin" or "user"
    created_at: datetime


# ========== Model Management Schemas ==========

class ScanModelsRequest(BaseModel):
    """扫描远程模型请求"""
    ssh_config: SSHConfig
    base_dir: str = "/mnt/data/models"
    include_hidden: bool = False


class ModelInfo(BaseModel):
    """模型信息"""
    name: str
    path: str
    size_gb: Optional[float] = None
    family: Optional[str] = None  # 模型家族（如qwen、deepseek）
    model_type: Optional[str] = None  # 模型类型（llm、embedding、rerank等）


class ScanModelsResponse(BaseModel):
    """扫描模型响应"""
    models: List[ModelInfo]
    total: int
    base_dir: str


class ValidateModelRequest(BaseModel):
    """验证模型路径请求"""
    ssh_config: SSHConfig
    model_path: str


class ValidateModelResponse(BaseModel):
    """验证模型路径响应"""
    exists: bool
    is_directory: bool
    size_gb: Optional[float] = None
    has_config: bool
    has_tokenizer: bool
    path: str


class LaunchModelRequest(BaseModel):
    """启动模型请求"""
    model_name: str
    engine: str
    tp: int = Field(gt=0)
    mode: str = "correct"
    scenario: Literal["amaas", "ft"] = "amaas"  # 测试场景：AMaaS或ft容器
    model_path: Optional[str] = None  # 完整路径
    host: str = "0.0.0.0"
    port: int = Field(ge=1024, le=65535)
    ssh_config: Optional[SSHConfig] = None
    base_model_dir: str = "/mnt/data/models"

    # AMaaS 场景参数
    amaas_api_port: int = 10001
    amaas_api_user: str = "admin"
    amaas_api_passwd: str = "123456"

    # FT 场景参数
    ft_container_name: str = "zhiwen-ft"
    ft_conda_env: str = "ftransformers"


class ModelInstanceResponse(BaseModel):
    """模型实例响应"""
    id: int
    model_name: str
    model_family: str
    model_type: str
    engine: str
    tp: int
    mode: str
    scenario: str
    model_path: str
    host: str
    port: int
    endpoint: Optional[str] = None
    pid: Optional[int] = None
    status: str
    error_message: Optional[str] = None
    ssh_config: Optional[Dict[str, Any]] = None
    launch_command: Optional[str] = None
    gpu_memory_gb: Optional[int] = None
    gpu_ids: Optional[str] = None
    last_health_check: Optional[datetime] = None
    health_check_failures: int
    created_at: datetime
    started_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None
    updated_at: datetime
    created_by: Optional[str] = None
    is_remote: bool
    is_running: bool
    is_stopped: bool


class LaunchModelResponse(BaseModel):
    """启动模型响应"""
    instance: ModelInstanceResponse
    message: str


class StopModelResponse(BaseModel):
    """停止模型响应"""
    instance_id: int
    success: bool
    message: str


class ModelInstanceListResponse(BaseModel):
    """模型实例列表响应"""
    instances: List[ModelInstanceResponse]
    total: int


class HealthCheckResponse(BaseModel):
    """健康检查响应"""
    instance_id: int
    healthy: bool
    endpoint: Optional[str] = None
    error: Optional[str] = None


# ========== Basic Test (Pytest) Schemas ==========

class BasicTestRequest(BaseModel):
    """基础测试请求"""
    scenario: Literal["amaas", "ft"] = "amaas"  # 测试场景
    ssh_config: SSHConfig  # SSH 配置
    appauto_branch: str = "main"  # Appauto 分支

    # 测试配置
    testpaths: Optional[str] = None  # 测试路径，默认根据 scenario 自动选择
    case_level: Optional[str] = None  # 测试级别
    model_priority: Optional[str] = None  # 模型优先级
    ft_port: Optional[int] = None  # FT 端口（FT 场景使用，默认35000）
    need_empty_gpu_count: Optional[int] = None  # 需要的空闲GPU数
    tp: Optional[str] = None  # TP 配置，例如 "[1, 2, 4, 8]"

    # 通知配置（可选）
    lark_user: Optional[str] = None  # 飞书用户
    topic: Optional[str] = None  # 主题
    notify_group: Optional[str] = None  # 通知组

    # 报告配置（可选）
    report_server: Optional[str] = None  # 报告服务器
    report_url: Optional[str] = None  # 报告 URL

    # 额外的 pytest 参数（可选）
    pytest_args: Optional[str] = None  # 额外参数，空格分隔


class BasicTestResponse(BaseModel):
    """基础测试响应"""
    task_id: int
    status: str
    scenario: str


# ===== 硬件信息收集 =====

class HardwareInfoCollectRequest(BaseModel):
    """硬件信息收集请求"""
    ssh_config: SSHConfig
    timeout: int = Field(default=300, description="执行超时时间（秒），默认 5 分钟")


class HardwareInfoCollectResponse(BaseModel):
    """硬件信息收集响应"""
    task_id: int
    status: str
    message: str = "Hardware info collection task submitted"


# ===== 正确性测试（EvalScope Eval）=====

class BaseTestEval(BaseModel):
    """正确性测试基础模型"""
    base: Literal["amaas", "ft"]
    skip_launch: bool

    ip: str
    port: int = Field(gt=0)

    model: str

    ssh_user: str = "qujing"
    ssh_password: Optional[str] = None
    ssh_port: int = Field(default=22, gt=0)

    # 评测参数
    dataset: str = Field(default="aime24", description="数据集名称，如 aime24、mmlu、ceval")
    dataset_args: Optional[str] = Field(default=None, description="数据集参数，JSON 格式")
    max_tokens: Optional[int] = Field(default=35000, gt=0, description="最大 token 数")
    concurrency: Optional[int] = Field(default=2, gt=0, description="并发度")
    limit: Optional[int] = Field(default=None, gt=0, description="限制每个子集只跑前 n 题")
    temperature: Optional[float] = Field(default=0.6, ge=0.0, le=2.0, description="温度参数")
    enable_thinking: Optional[bool] = Field(default=True, description="是否开启 thinking 模式")
    debug: Optional[bool] = Field(default=False, description="是否开启 debug 模式")
    timeout: Optional[float] = Field(default=4.0, gt=0, description="测试超时时间（小时）")

    # 模型启动参数（非 skip_launch 时需要）
    tp: Literal[1, 2, 4, 8] = Field(default=1, description="几卡拉起模型")
    keep_model: Optional[bool] = Field(default=True, description="测试完成后是否保持模型运行（默认保持）")

    # Appauto 版本配置
    appauto_branch: str = "main"


class TestEvalViaAMaaSSkipLaunch(BaseTestEval):
    """AMaaS 场景正确性测试 - 跳过模型启动"""
    base: Literal["amaas"] = "amaas"
    skip_launch: bool = True
    port: int = 10011


class TestEvalViaAMaaSWithLaunch(BaseTestEval):
    """AMaaS 场景正确性测试 - 自动启动模型"""
    base: Literal["amaas"] = "amaas"
    skip_launch: bool = False
    port: int = 10011
    launch_timeout: int = Field(default=900, gt=0, description="模型拉起超时时间（秒）")


class TestEvalViaFTSkipLaunch(BaseTestEval):
    """FT 场景正确性测试 - 跳过模型启动"""
    base: Literal["ft"] = "ft"
    skip_launch: bool = True


class TestEvalViaFTWithLaunch(BaseTestEval):
    """FT 场景正确性测试 - 自动启动模型"""
    base: Literal["ft"] = "ft"
    skip_launch: bool = False
    launch_timeout: int = Field(default=900, gt=0, description="模型拉起超时时间（秒）")


class TestEvalResponse(BaseModel):
    """正确性测试响应"""
    task_id: int
    display_id: int
    uuid: str
    status: str
    message: str


# ===== 环境部署 =====

class DeployAMaaSRequest(BaseModel):
    """AMaaS 部署请求"""
    ip: str
    tag: str
    tar_name: str
    ssh_user: str = "qujing"
    ssh_password: str = "qujing@$#21"
    ssh_port: int = 22
    user: Optional[str] = None  # 消息卡片中的用户信息
    appauto_branch: str = "main"


class DeployFTRequest(BaseModel):
    """FT 部署请求"""
    ip: str
    image: str = "approachingai/ktransformers"
    tag: str
    tar_name: str
    ssh_user: str = "qujing"
    ssh_password: str = "qujing@$#21"
    ssh_port: int = 22
    user: Optional[str] = None  # 消息卡片中的用户信息
    appauto_branch: str = "main"


class DeployResponse(BaseModel):
    """部署响应"""
    task_id: int
    display_id: int
    uuid: str
    status: str
    message: str
