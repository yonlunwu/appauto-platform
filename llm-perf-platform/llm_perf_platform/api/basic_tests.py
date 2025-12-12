"""基础测试 API

提供基础测试（pytest）的 API 接口
"""
from fastapi import APIRouter

from llm_perf_platform.api.schemas import (
    BasicTestRequest,
    BasicTestResponse,
)
from llm_perf_platform.executor.base_executor import TaskType
from llm_perf_platform.services.task_service import TaskService
from llm_perf_platform.tasks.scheduler import task_scheduler

router = APIRouter(prefix="/basic-tests")

task_service = TaskService()


@router.post("/run", response_model=BasicTestResponse)
def run_basic_test(request: BasicTestRequest):
    """运行基础测试（pytest）

    Args:
        request: 基础测试请求

    Returns:
        BasicTestResponse: 任务信息
    """
    # 构建参数字典
    parameters = request.model_dump()
    ssh_config_dict = None
    if request.ssh_config:
        ssh_config_dict = request.ssh_config.model_dump()
        parameters["ssh_config"] = ssh_config_dict

    # 创建任务记录
    record = task_service.create_task(
        engine="pytest",
        model=f"{request.scenario}_basic_test",
        parameters=parameters,
        status="queued",
        ssh_config=ssh_config_dict,
    )

    # 构建执行payload
    payload = {
        "task_id": record.id,
        "task_type": TaskType.PYTEST.value,  # 修复：使用 task_type 而不是 command_type
        "scenario": request.scenario,
        "ssh_config": ssh_config_dict,
        "testpaths": request.testpaths,
        "case_level": request.case_level,
        "model_priority": request.model_priority,
        "lark_user": request.lark_user,
        "topic": request.topic,
        "notify_group": request.notify_group,
        "report_server": request.report_server,
        "report_url": request.report_url,
        "pytest_args": request.pytest_args,
        "appauto_branch": request.appauto_branch if hasattr(request, 'appauto_branch') else "main",
    }

    # 提交任务
    task_scheduler.submit(record.id, payload)

    return BasicTestResponse(
        task_id=record.id,
        status=record.status,
        scenario=request.scenario,
    )
