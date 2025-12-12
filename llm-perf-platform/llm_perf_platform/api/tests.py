from pathlib import Path
from typing import Any, Dict
import math

from fastapi import APIRouter, HTTPException, status, Depends, Query
from fastapi.responses import FileResponse

from llm_perf_platform.api.auth import get_current_user
from llm_perf_platform.api.schemas import (
    ArchiveRequest,
    ArchiveResponse,
    CancelTaskResponse,
    ConcurrencyProbeRequest,
    ConcurrencyProbeResponse,
    DeleteTaskResponse,
    HardwareInfoCollectRequest,
    HardwareInfoCollectResponse,
    RetryTaskResponse,
    TaskDetailResponse,
    TaskListResponse,
    TaskLogsResponse,
    TaskSummary,
    TestRunRequest,
    TestRunResponse,
    TestPerfViaAMaaSSkipLaunch,
    TestPerfViaAmaaSWithLaunch,
    TestPerfViaFTSkipLaunch,
    TestPerfViaFTWithLaunch,
)
from llm_perf_platform.executor.logger import LOG_DIR
from llm_perf_platform.models.db import get_session
from llm_perf_platform.models.user_account import UserAccount
from llm_perf_platform.services.concurrency import ConcurrencyService
from llm_perf_platform.services.task_service import TaskService
from llm_perf_platform.storage.results import ResultStorage
from llm_perf_platform.tasks.scheduler import task_scheduler

router = APIRouter(prefix="/tests")

task_service = TaskService()
concurrency_service = ConcurrencyService()
result_storage = ResultStorage()


@router.post("/run", response_model=TestRunResponse)
def run_test(request: TestRunRequest, current_user = Depends(get_current_user)):
    # 验证远程执行模式下必须提供SSH配置
    if request.execution_mode == "remote" and not request.ssh_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SSH configuration is required for remote execution mode. Please configure SSH connection or switch to local mode."
        )

    concurrency_details: Dict[str, Any] | None = None
    resolved_concurrency = request.concurrency

    if request.auto_concurrency or not resolved_concurrency:
        ssh_config_for_probe = None
        if request.ssh_config:
            ssh_config_for_probe = request.ssh_config.model_dump()

        concurrency_details = concurrency_service.estimate(
            engine=request.engine,
            model=request.model,
            input_length=request.input_length,
            output_length=request.output_length,
            ssh_config=ssh_config_for_probe,
        )
        resolved_concurrency = concurrency_details["suggested"]

    parameters = request.model_dump()
    parameters["concurrency"] = resolved_concurrency
    if concurrency_details:
        parameters["concurrency_details"] = concurrency_details

    ssh_config_dict = None
    if request.ssh_config:
        ssh_config_dict = request.ssh_config.model_dump()

    record = task_service.create_task(
        engine=request.engine,
        model=request.model,
        parameters=parameters,
        status="queued",
        ssh_config=ssh_config_dict,
        user_id=current_user.id,
        appauto_branch=request.appauto_branch,
    )

    payload = {
        "task_id": record.id,
        "engine": request.engine,
        "model": request.model,
        "input_length": request.input_length,
        "output_length": request.output_length,
        "concurrency": resolved_concurrency,
        "loop": request.loop,
        "warmup": request.warmup,
        "execution_mode": request.execution_mode,
        "scenario": request.scenario,
        "ssh_config": ssh_config_dict,
        "appauto_branch": request.appauto_branch,
        # 模型启动配置
        "auto_launch_model": request.auto_launch_model,
        "model_config_name": request.model_config_name,
        "model_path": request.model_path,
        "model_tp": request.model_tp,
        "model_mode": request.model_mode,
        "model_port": request.model_port,
        "model_host": request.model_host,
        "stop_model_after_test": request.stop_model_after_test,
        # AMaaS API 配置
        "amaas_api_port": request.amaas_api_port,
        "amaas_api_user": request.amaas_api_user,
        "amaas_api_passwd": request.amaas_api_passwd,
    }

    task_scheduler.submit(record.id, payload)

    return TestRunResponse(
        task_id=record.id,
        status=record.status,
        concurrency=resolved_concurrency,
        auto_concurrency=request.auto_concurrency,
        concurrency_details=concurrency_details,
    )


@router.post("/run_perf/amaas/skip_launch", response_model=TestRunResponse)
def run_perf_via_amaas_skip_launch(request: TestPerfViaAMaaSSkipLaunch, current_user = Depends(get_current_user)):
    """AMaaS 场景性能测试 - 跳过模型启动"""
    return _run_perf_test(
        base="amaas",
        skip_launch=True,
        request=request,
        current_user=current_user,
    )


@router.post("/run_perf/amaas/with_launch", response_model=TestRunResponse)
def run_perf_via_amaas_with_launch(request: TestPerfViaAmaaSWithLaunch, current_user = Depends(get_current_user)):
    """AMaaS 场景性能测试 - 自动启动模型"""
    return _run_perf_test(
        base="amaas",
        skip_launch=False,
        request=request,
        current_user=current_user,
    )


@router.post("/run_perf/ft/skip_launch", response_model=TestRunResponse)
def run_perf_via_ft_skip_launch(request: TestPerfViaFTSkipLaunch, current_user = Depends(get_current_user)):
    """FT 容器场景性能测试 - 跳过模型启动"""
    return _run_perf_test(
        base="ft",
        skip_launch=True,
        request=request,
        current_user=current_user,
    )


@router.post("/run_perf/ft/with_launch", response_model=TestRunResponse)
def run_perf_via_ft_with_launch(request: TestPerfViaFTWithLaunch, current_user = Depends(get_current_user)):
    """FT 容器场景性能测试 - 自动启动模型"""
    return _run_perf_test(
        base="ft",
        skip_launch=False,
        request=request,
        current_user=current_user,
    )


@router.get("/list", response_model=TaskListResponse)
def list_tasks(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页大小"),
    task_type: str = Query(None, description="任务类型过滤 (hardware_info, perf_test, etc.)"),
    current_user = Depends(get_current_user)
):
    """获取任务列表（分页）

    默认每页返回20个任务，按创建时间倒序排列
    可以通过 task_type 参数过滤特定类型的任务
    """
    tasks, total = task_service.list_tasks_paginated(
        page=page,
        page_size=page_size,
        task_type=task_type,
    )

    items = [serialize_task(record, current_user.id) for record in tasks]
    total_pages = math.ceil(total / page_size) if total > 0 else 0

    return TaskListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/{task_id}", response_model=TaskDetailResponse)
def get_task(task_id: int):
    record = task_service.get_task(task_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return serialize_task(record)


@router.post("/archive", response_model=ArchiveResponse)
def archive_task(request: ArchiveRequest):
    """归档任务结果文件

    ⚠️ WARNING: This API is under development and incomplete.
    TODO:
    - 当前仅归档 xlsx 文件，缺少硬件配置信息
    - 需要收集并打包硬件信息（GPU、CPU、内存等）
    - 需要添加测试配置参数
    - 归档包应包含：性能结果 + 硬件信息 + 测试配置

    使用建议：
    1. 先使用 /hardware_info/collect API 收集硬件信息
    2. 等待完整的归档功能实现后再使用本功能
    """
    record = task_service.get_task(request.task_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    if not record.result_path:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task result missing")

    archived_path = result_storage.archive_result(
        engine=record.engine,
        model=record.model,
        source_path=record.result_path,
    )
    task_service.attach_archive(record.id, archived_path)
    return ArchiveResponse(task_id=record.id, archived_path=archived_path)


@router.get("/{task_id}/result")
def download_result(task_id: int):
    record = task_service.get_task(task_id)
    if not record or not record.result_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found")

    path = Path(record.result_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing on disk")

    return FileResponse(path, filename=path.name)


@router.delete("/{task_id}", response_model=DeleteTaskResponse)
def delete_task(task_id: int, current_user = Depends(get_current_user)):
    record = task_service.get_task(task_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    # 检查权限：只有任务创建者可以删除
    if record.user_id and record.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this task"
        )

    task_service.delete_task(task_id)
    result_storage.delete_file(record.result_path)
    result_storage.delete_file(record.archived_path)

    # 删除日志文件 - 使用新的命名格式: {display_id}_{uuid}.log
    display_id = record.display_id or task_id
    log_file = LOG_DIR / f"{display_id}_{record.uuid}.log"
    if log_file.exists():
        log_file.unlink()
    return DeleteTaskResponse(deleted=True)


@router.post("/{task_id}/cancel", response_model=CancelTaskResponse)
def cancel_task(task_id: int, current_user = Depends(get_current_user)):
    """取消正在运行的任务

    只有任务创建者可以取消任务。
    只能取消状态为 queued 或 running 的任务。
    """
    # 获取任务记录
    record = task_service.get_task(task_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    # 检查权限：只有任务创建者可以取消
    if record.user_id and record.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to cancel this task"
        )

    # 检查任务状态
    if record.status not in ["queued", "running"]:
        return CancelTaskResponse(
            task_id=task_id,
            cancelled=False,
            message=f"Task cannot be cancelled. Current status: {record.status}"
        )

    # 尝试取消任务
    cancelled = task_scheduler.cancel_task(task_id)

    if cancelled:
        return CancelTaskResponse(
            task_id=task_id,
            cancelled=True,
            message="Task has been cancelled successfully"
        )
    else:
        # 如果 Future 无法取消（可能已经开始执行），直接标记为已取消
        task_service.mark_cancelled(task_id)
        return CancelTaskResponse(
            task_id=task_id,
            cancelled=True,
            message="Task has been marked as cancelled"
        )


@router.post("/{task_id}/retry", response_model=RetryTaskResponse)
def retry_task(task_id: int, current_user = Depends(get_current_user)):
    """重新提交任务

    根据原任务的参数创建一个新任务并提交执行。
    适用于失败或需要重新运行的任务。
    """
    # 获取原任务记录
    original_task = task_service.get_task(task_id)
    if not original_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found"
        )

    # 提取原任务参数
    parameters = dict(original_task.parameters)

    # 自动检测并添加缺失的 task_type 字段（向后兼容）
    if "task_type" not in parameters:
        # 通过特征字段判断任务类型
        # 如果有 base/skip_launch/parallel/number 字段，说明是命令行方式的 perf test
        if "base" in parameters and "parallel" in parameters and "number" in parameters:
            parameters["task_type"] = "perf_test_cmd"

            # 命令行方式需要顶层的 SSH 字段，如果缺失则从 ssh_config 中提取
            ssh_config = parameters.get("ssh_config")
            if ssh_config:
                if "ssh_user" not in parameters:
                    parameters["ssh_user"] = ssh_config.get("user", "")
                if "ssh_password" not in parameters:
                    parameters["ssh_password"] = ssh_config.get("password")
                if "ssh_port" not in parameters:
                    parameters["ssh_port"] = ssh_config.get("port", 22)
        # 否则是 Python API 方式
        # 不需要显式设置，调度器会使用默认值 perf_test_api

    # 创建新任务记录
    new_record = task_service.create_task(
        engine=original_task.engine,
        model=original_task.model,
        parameters=parameters,
        status="queued",
        ssh_config=original_task.ssh_config,
        user_id=current_user.id,
    )

    # 构建 payload 并提交到调度器
    payload = dict(parameters)
    payload["task_id"] = new_record.id
    payload["engine"] = original_task.engine
    payload["model"] = original_task.model

    task_scheduler.submit(new_record.id, payload)

    return RetryTaskResponse(
        task_id=task_id,
        new_task_id=new_record.id,
        status="queued",
        message=f"Task {task_id} has been resubmitted as task {new_record.id}"
    )


@router.get("/{task_id}/logs", response_model=TaskLogsResponse)
def get_task_logs(task_id: int):
    """获取任务执行日志

    返回任务的完整执行日志内容。
    如果日志文件不存在，返回提示信息。
    """
    # 检查任务是否存在
    record = task_service.get_task(task_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found"
        )

    # 获取日志文件路径 - 使用新的命名格式: {display_id}_{uuid}.log
    display_id = record.display_id or task_id
    log_file = LOG_DIR / f"{display_id}_{record.uuid}.log"

    if not log_file.exists():
        return TaskLogsResponse(
            task_id=task_id,
            logs=f"No logs available for task {task_id}. Task may not have started yet or logs were not generated.",
            log_file_path=None
        )

    # 读取日志内容
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            logs = f.read()

        return TaskLogsResponse(
            task_id=task_id,
            logs=logs,
            log_file_path=str(log_file)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read logs: {str(e)}"
        )


@router.post("/hardware_info/collect", response_model=HardwareInfoCollectResponse)
def collect_hardware_info(request: HardwareInfoCollectRequest, current_user = Depends(get_current_user)):
    """收集远程机器的硬件信息

    收集包括：
    - GPU 信息（nvidia-smi）
    - CPU 信息（核心数、型号、架构）
    - 内存信息（总量、已用、可用）
    - 磁盘信息
    - 操作系统信息
    - 网络信息

    生成的 JSON 文件可供下载查看。
    """
    # 构建 SSH 配置
    ssh_config = request.ssh_config.model_dump()

    # 创建任务记录
    record = task_service.create_task(
        engine="system",  # 使用 system 作为引擎标识
        model="hardware_info",  # 使用 hardware_info 作为模型名称
        parameters={
            "ssh_config": ssh_config,
            "timeout": request.timeout,
        },
        status="queued",
        ssh_config=ssh_config,
        user_id=current_user.id,
        task_type="hardware_info",
    )

    # 构建调度器 payload
    payload = {
        "task_id": record.id,
        "task_type": "hardware_info",
        "ssh_config": ssh_config,
        "timeout": request.timeout,
    }

    # 提交任务到调度器
    task_scheduler.submit(record.id, payload)

    return HardwareInfoCollectResponse(
        task_id=record.id,
        status=record.status,
        message=f"Hardware info collection task {record.id} has been submitted"
    )


@router.post("/concurrency/probe", response_model=ConcurrencyProbeResponse)
def probe_concurrency(request: ConcurrencyProbeRequest):
    ssh_config_dict = None
    if request.ssh_config:
        ssh_config_dict = request.ssh_config.dict()

    return concurrency_service.estimate(
        engine=request.engine,
        model=request.model,
        input_length=request.input_length,
        output_length=request.output_length,
        ssh_config=ssh_config_dict,
    )


def _run_perf_test(
    base: str,
    skip_launch: bool,
    request,
    current_user,
) -> TestRunResponse:
    """性能测试的通用实现函数

    Args:
        base: 测试基础环境，"amaas" 或 "ft"
        skip_launch: 是否跳过模型启动
        request: 请求对象（BaseTestPerf 子类）
        current_user: 当前登录用户

    Returns:
        TestRunResponse: 测试任务响应
    """
    # 构建 SSH 配置
    ssh_config = {
        "host": request.ip,
        "port": request.ssh_port,
        "user": request.ssh_user,
        "auth_type": "password" if request.ssh_password else "key",
        "password": request.ssh_password,
        "timeout": 30,
    }

    # 解析并发度参数
    parallel_list = [int(x.strip()) for x in request.parallel.split()]

    # 估算建议并发度（使用第一个并发值作为参考）
    concurrency_details: Dict[str, Any] | None = None
    suggested_concurrency = parallel_list[0] if parallel_list else 1

    # 准备模型名称（如果没有提供，则留空等待验证）
    model = request.model or "unknown"

    # 构建任务参数（包含所有 payload 需要的字段，确保重试时不丢失信息）
    parameters = {
        "task_type": "perf_test_cmd",  # 标记为命令行方式，重试时需要
        "base": base,
        "skip_launch": skip_launch,
        "ip": request.ip,
        "port": request.port,
        "model": model,
        "tokenizer_path": request.tokenizer_path,
        "ssh_config": ssh_config,
        "ssh_user": request.ssh_user,
        "ssh_password": request.ssh_password,
        "ssh_port": request.ssh_port,
        "parallel": request.parallel,
        "number": request.number,
        "input_length": request.input_length,
        "output_length": request.output_length,
        "loop": request.loop,
        "debug": request.debug,
        "warmup": request.warmup,
        "keep_model": request.keep_model,
        "concurrency": suggested_concurrency,
        "tp": request.tp,
        "appauto_branch": request.appauto_branch,
    }

    # 根据场景添加特定参数
    if not skip_launch:
        if base == "amaas":
            parameters["amaas_api_port"] = 10001
            parameters["amaas_api_user"] = "admin"
            parameters["amaas_api_passwd"] = "123456"
        elif base == "ft":
            parameters["launch_timeout"] = getattr(request, "launch_timeout", 900)

    # 创建任务记录
    record = task_service.create_task(
        engine="evalscope",  # 使用 evalscope 作为引擎
        model=model,
        parameters=parameters,
        status="queued",
        ssh_config=ssh_config,
        user_id=current_user.id,
        appauto_branch=request.appauto_branch,
    )

    # 构建调度器 payload
    payload = {
        "task_id": record.id,
        "task_type": "perf_test_cmd",  # 使用命令行方式
        "base": base,
        "skip_launch": skip_launch,
        "ip": request.ip,
        "port": request.port,
        "model": model,
        "tokenizer_path": request.tokenizer_path,
        "ssh_user": request.ssh_user,
        "ssh_password": request.ssh_password,
        "ssh_port": request.ssh_port,
        "parallel": request.parallel,
        "number": request.number,
        "input_length": request.input_length,
        "output_length": request.output_length,
        "loop": request.loop,
        "debug": request.debug,
        "warmup": request.warmup,
        "keep_model": request.keep_model,
        "ssh_config": ssh_config,
        "tp": request.tp,
        "appauto_branch": request.appauto_branch,
    }

    # 添加场景特定参数
    if not skip_launch:
        if base == "amaas":
            payload["amaas_api_port"] = 10001
            payload["amaas_api_user"] = "admin"
            payload["amaas_api_passwd"] = "123456"
        elif base == "ft":
            payload["tp"] = getattr(request, "tp", 1)
            payload["launch_timeout"] = getattr(request, "launch_timeout", 900)

    # 提交任务到调度器
    task_scheduler.submit(record.id, payload)

    return TestRunResponse(
        task_id=record.id,
        status=record.status,
        concurrency=suggested_concurrency,
        auto_concurrency=False,
        concurrency_details=concurrency_details,
    )


def serialize_task(record, current_user_id: int = None) -> TaskSummary:
    user_email = None
    if record.user_id:
        with get_session() as session:
            user = session.get(UserAccount, record.user_id)
            if user:
                user_email = user.email

    return TaskSummary(
        id=record.id,
        uuid=record.uuid,
        display_id=record.display_id,
        engine=record.engine,
        model=record.model,
        status=record.status,
        created_at=record.created_at,
        completed_at=record.completed_at,
        result_path=record.result_path,
        archived_path=record.archived_path,
        error_message=record.error_message,
        parameters=record.parameters,
        summary=record.summary,
        ssh_config=record.ssh_config,
        user_id=record.user_id,
        user_email=user_email,
    )


@router.get("/appauto/branches")
def get_appauto_branches(current_user: UserAccount = Depends(get_current_user)) -> Dict[str, Any]:
    """获取可用的 appauto 分支列表

    从 appauto 源码仓库获取所有分支
    """
    import subprocess
    from llm_perf_platform.services.venv_manager import get_venv_manager

    venv_manager = get_venv_manager()
    appauto_source = venv_manager.appauto_source

    if not appauto_source.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Appauto source not found at {appauto_source}"
        )

    try:
        # 获取所有本地和远程分支
        result = subprocess.run(
            ["git", "branch", "-a"],
            cwd=appauto_source,
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode != 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get branches: {result.stderr}"
            )

        # 解析分支列表
        branches = []
        for line in result.stdout.split("\n"):
            line = line.strip()
            if not line:
                continue

            # 移除当前分支标记 *
            if line.startswith("* "):
                line = line[2:]

            # 跳过 HEAD 指针
            if "HEAD ->" in line:
                continue

            # 处理远程分支
            if line.startswith("remotes/origin/"):
                branch = line.replace("remotes/origin/", "")
                if branch not in branches:
                    branches.append(branch)
            else:
                # 本地分支
                if line not in branches:
                    branches.append(line)

        # 排序并将 main 放在最前面
        branches.sort()
        if "main" in branches:
            branches.remove("main")
            branches.insert(0, "main")

        return {
            "branches": branches,
            "source_path": str(appauto_source),
        }

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Timeout while getting branches"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting branches: {str(e)}"
        )

