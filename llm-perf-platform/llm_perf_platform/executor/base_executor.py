"""执行器基类

定义所有执行器的通用接口，支持：
- Python API 方式（TestExecutor）
- 命令行方式（CommandExecutor）
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from enum import Enum

from llm_perf_platform.executor.logger import TaskLogger
from llm_perf_platform.services.task_service import TaskService


class TaskType(str, Enum):
    """任务类型枚举"""
    # 性能测试相关
    PERF_TEST_API = "perf_test_api"  # 使用 appauto Python API
    PERF_TEST_CMD = "perf_test_cmd"  # 使用 appauto bench evalscope 命令

    # 正确性测试
    EVAL_TEST = "eval_test"  # 使用 appauto bench evalscope eval 命令

    # pytest 测试
    PYTEST = "pytest"  # appauto run pytest

    # 环境部署
    ENV_DEPLOY = "env_deploy"  # appauto env deploy

    # 硬件信息收集
    HARDWARE_INFO = "hardware_info"  # 收集远程机器硬件信息

    # 系统维护
    SYSTEM_MAINTENANCE = "system_maintenance"  # 系统维护（更新 appauto 等）

    # 通用命令
    GENERIC_COMMAND = "generic_command"  # 通用的 appauto 命令


class ExecutionResult:
    """统一的执行结果格式"""

    def __init__(
        self,
        success: bool,
        summary: Dict[str, Any],
        error: Optional[str] = None,
        requests: Optional[list] = None,
        output_file: Optional[str] = None,
        stdout: Optional[str] = None,
        stderr: Optional[str] = None,
        exit_code: Optional[int] = None,
    ):
        self.success = success
        self.summary = summary
        self.error = error
        self.requests = requests or []
        self.output_file = output_file
        self.stdout = stdout
        self.stderr = stderr
        self.exit_code = exit_code

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        result = {
            "success": self.success,
            "summary": self.summary,
            "requests": self.requests,
        }
        if self.error:
            result["error"] = self.error
        if self.output_file:
            result["output_file"] = self.output_file
        if self.stdout:
            result["stdout"] = self.stdout
        if self.stderr:
            result["stderr"] = self.stderr
        if self.exit_code is not None:
            result["exit_code"] = self.exit_code
        return result


class BaseExecutor(ABC):
    """执行器抽象基类

    所有执行器必须实现 execute 方法，返回统一的 ExecutionResult
    """

    def __init__(self, task_id: int):
        self.task_id = task_id

        # Fetch task record to get UUID and display_id for logger
        task_service = TaskService()
        task = task_service.get_task(task_id)
        if task:
            self.logger = TaskLogger(task.uuid, task.display_id or task_id)
        else:
            # Fallback: if task not found, use task_id for both
            # This shouldn't happen in normal operation
            import uuid
            self.logger = TaskLogger(str(uuid.uuid4()), task_id)

    @abstractmethod
    async def execute(self, payload: Dict[str, Any]) -> ExecutionResult:
        """执行任务

        Args:
            payload: 任务参数字典

        Returns:
            ExecutionResult: 统一的执行结果
        """
        pass

    def log_info(self, message: str) -> None:
        """记录信息日志"""
        self.logger.info(message)
        
    def log_error(self, message: str) -> None:
        """记录错误日志"""
        self.logger.error(message)
        
    def log_warning(self, message: str) -> None:
        """记录警告日志"""
        self.logger.warning(message)

    def log_debug(self, message: str) -> None:
        """记录调试日志"""
        self.logger.debug(message)
