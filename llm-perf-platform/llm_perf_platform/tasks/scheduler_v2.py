from __future__ import annotations

import asyncio
from concurrent.futures import Future, ThreadPoolExecutor
import threading
from pathlib import Path
from typing import Any, Dict, Optional

from pydantic import BaseModel

from llm_perf_platform.executor.base_executor import TaskType
from llm_perf_platform.executor.test_executor import run_test_sync
from llm_perf_platform.executor.command_executor import CommandExecutor
from llm_perf_platform.services.task_service import TaskService
from llm_perf_platform.services.venv_manager import get_venv_manager
from llm_perf_platform.storage.results import ResultStorage, RESULTS_DIR

from llm_perf_platform.utils.logging_config import get_logger


class TaskScheduler:
    """任务调度器 - 支持多种执行方式

    职责：
    1. 管理任务队列和并发执行
    2. 根据任务类型选择执行器：
       - Python API 方式（TestExecutor）
       - 命令行方式（CommandExecutor）
    3. 记录任务状态和结果

    支持的任务类型：
    - PERF_TEST_API: 性能测试（Python API）
    - PERF_TEST_CMD: 性能测试（命令行）
    - PYTEST: pytest 测试
    - ENV_DEPLOY: 环境部署
    - GENERIC_COMMAND: 通用命令
    """

    def __init__(self, max_workers: int = 4) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._lock = threading.Lock()
        self._futures: Dict[int, Future] = {}
        self._executors: Dict[int, Any] = {}
        self._task_service = TaskService()
        self._result_storage = ResultStorage()
        self._started = False

    def start(self) -> None:
        self._started = True

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=False)
        self._started = False

    def submit(self, task_id: int, payload: BaseModel) -> Future:  # ← 强制使用 BaseModel
        """提交任务到调度器

        Args:
            task_id: 任务ID
            payload: 任务参数（Pydantic Model）

        Returns:
            Future: 任务执行的 Future 对象
        """
        if not self._started:
            self.start()
        future = self._executor.submit(self._run_task, task_id, payload)
        with self._lock:
            self._futures[task_id] = future
        future.add_done_callback(lambda _: self._cleanup(task_id))
        return future

    # TODO: 优化 _run_task 内部逻辑，拆分成更小的函数
    def _run_task(self, task_id: int, payload: BaseModel) -> None:  # ← 强制使用 BaseModel
        """执行单个测试任务

        Args:
            task_id: 任务ID
            payload: 任务参数（Pydantic Model）
        """
        try:
            self._task_service.mark_running(task_id)

            # 获取任务记录以获取 display_id（用于文件命名）
            task_record = self._task_service.get_task(task_id)
            display_id = task_record.display_id if task_record and task_record.display_id else task_id

            # ← 关键改进：直接使用 Model 属性，无需 .get()
            task_type_str = getattr(payload, "task_type", "perf_test_api")
            try:
                task_type = TaskType(task_type_str)
            except ValueError:
                task_type = TaskType.PERF_TEST_API

            # 根据任务类型选择执行器
            if task_type == TaskType.PERF_TEST_API:
                # 兼容旧版：传给 run_test_sync 需要 dict
                result = run_test_sync(payload.model_dump())
            elif task_type == TaskType.HARDWARE_INFO:
                result = self._run_hardware_info_task(task_id, payload, display_id)
            elif task_type == TaskType.SYSTEM_MAINTENANCE:
                result = self._run_system_maintenance_task(task_id, payload, display_id)
            else:
                # 命令行方式
                result = self._run_command_task(task_id, task_type, payload)

            # 处理执行结果（逻辑不变，但使用 getattr 访问 payload 属性）
            if result.get("success"):
                summary = result.get("summary", {})
                appauto_xlsx = summary.get("output_xlsx")
                output_file = result.get("output_file")

                if task_type == TaskType.HARDWARE_INFO and output_file:
                    self._task_service.mark_completed(
                        task_id=task_id,
                        result_path=output_file,
                        summary=summary,
                    )
                elif task_type == TaskType.SYSTEM_MAINTENANCE:
                    self._task_service.mark_completed(
                        task_id=task_id,
                        result_path="",
                        summary=summary,
                    )
                elif task_type != TaskType.PERF_TEST_API and appauto_xlsx:
                    # 处理 appauto 生成的 xlsx 文件
                    from pathlib import Path
                    import shutil

                    # ← 使用 getattr 获取属性，享受 IDE 类型提示
                    appauto_branch = getattr(payload, "appauto_branch", "main")
                    venv_manager = get_venv_manager()
                    repo_path = venv_manager.get_repo_path(appauto_branch)
                    original_file = repo_path / appauto_xlsx

                    if original_file.exists():
                        new_filename = f"{display_id}_{original_file.name}"
                        target_file = RESULTS_DIR / new_filename

                        if target_file.exists():
                            target_file.unlink()

                        shutil.move(str(original_file), str(target_file))
                        file_path = str(target_file)

                        self._task_service.mark_completed(
                            task_id=task_id,
                            result_path=file_path,
                            summary=summary,
                        )
                    else:
                        # 回退到生成新文件
                        file_path = self._result_storage.persist_result(
                            task_id=display_id,
                            parameters=payload.model_dump(),
                            summary=summary,
                            request_rows=result.get("requests", []),
                        )
                        self._task_service.mark_completed(
                            task_id=task_id,
                            result_path=file_path,
                            summary=summary,
                        )
                else:
                    # Python API 方式
                    if output_file:
                        from pathlib import Path
                        import shutil

                        original_file = Path(output_file)
                        if not original_file.is_absolute():
                            appauto_branch = getattr(payload, "appauto_branch", "main")
                            venv_manager = get_venv_manager()
                            repo_path = venv_manager.get_repo_path(appauto_branch)
                            original_file = repo_path / output_file

                        if original_file.exists():
                            new_filename = f"{display_id}_{original_file.name}"
                            target_file = RESULTS_DIR / new_filename

                            if target_file.exists():
                                target_file.unlink()

                            shutil.move(str(original_file), str(target_file))
                            file_path = str(target_file)

                            self._task_service.mark_completed(
                                task_id=task_id,
                                result_path=file_path,
                                summary=summary,
                            )
                        else:
                            file_path = self._result_storage.persist_result(
                                task_id=display_id,
                                parameters=payload.model_dump(),
                                summary=summary,
                                request_rows=result.get("requests", []),
                            )
                            self._task_service.mark_completed(
                                task_id=task_id,
                                result_path=file_path,
                                summary=summary,
                            )
                    else:
                        file_path = self._result_storage.persist_result(
                            task_id=display_id,
                            parameters=payload.model_dump(),
                            summary=summary,
                            request_rows=result.get("requests", []),
                        )
                        self._task_service.mark_completed(
                            task_id=task_id,
                            result_path=file_path,
                            summary=summary,
                        )
            else:
                error_message = result.get("error", "unknown-error")
                if error_message == "task_cancelled":
                    self._task_service.mark_cancelled(task_id)
                else:
                    self._task_service.mark_failed(task_id, error_message)
        except Exception as exc:
            task_record = self._task_service.get_task(task_id)
            if task_record and task_record.status == "cancelled":
                return
            self._task_service.mark_failed(task_id, str(exc))

    def _run_hardware_info_task(
        self, task_id: int, payload: BaseModel, display_id: int  # ← 改为 BaseModel
    ) -> Dict[str, Any]:
        """使用硬件信息收集执行器运行任务"""
        from llm_perf_platform.executor.hardware_info_executor import HardwareInfoExecutor

        executor = HardwareInfoExecutor(
            task_id=task_id,
            timeout=getattr(payload, "timeout", 300),
        )

        # 构造执行参数 dict（执行器接口暂时保持 dict 兼容）
        exec_payload = payload.model_dump()
        exec_payload["display_id"] = display_id

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            result = loop.run_until_complete(executor.execute(exec_payload))
            return result.to_dict()
        finally:
            loop.close()

    def _run_system_maintenance_task(
        self, task_id: int, payload: BaseModel, display_id: int  # ← 改为 BaseModel
    ) -> Dict[str, Any]:
        """使用系统维护执行器运行任务"""
        from llm_perf_platform.executor.system_maintenance_executor import SystemMaintenanceExecutor

        executor = SystemMaintenanceExecutor(task_id=task_id)
        
        # 构造执行参数
        exec_payload = payload.model_dump()
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            result = loop.run_until_complete(executor.execute(exec_payload))
            return result.to_dict()
        finally:
            loop.close()

    def _run_command_task(
        self, task_id: int, task_type: TaskType, payload: BaseModel  # ← 改为 BaseModel
    ) -> Dict[str, Any]:
        """使用命令行执行器运行任务"""
        # ← 使用 getattr 替代 .get()
        appauto_branch = getattr(payload, "appauto_branch", "main")

        venv_manager = get_venv_manager()
        appauto_bin_path = venv_manager.ensure_repo(appauto_branch)
        if not appauto_bin_path:
            raise RuntimeError(
                f"Failed to create or find environment for appauto branch '{appauto_branch}'. "
                f"Please check the appauto source path and git branch."
            )

        executor = CommandExecutor(
            task_id=task_id,
            command_type=task_type,
            appauto_branch=appauto_branch,
            timeout=getattr(payload, "timeout", 3600),
        )

        with self._lock:
            self._executors[task_id] = executor

        # 传给执行器时转换为 dict（如果执行器仍需要 dict）
        exec_payload = payload.model_dump()
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            result = loop.run_until_complete(executor.execute(exec_payload))
            return result.to_dict()
        finally:
            loop.close()
            with self._lock:
                self._executors.pop(task_id, None)

    def _cleanup(self, task_id: int) -> None:
        with self._lock:
            self._futures.pop(task_id, None)
            self._executors.pop(task_id, None)

    def get_future(self, task_id: int) -> Optional[Future]:
        with self._lock:
            return self._futures.get(task_id)

    def cancel_task(self, task_id: int) -> bool:
        """取消指定任务"""
        logger = get_logger(__name__)
        logger.info(f"[Scheduler] cancel_task called for task {task_id}")

        with self._lock:
            future = self._futures.get(task_id)
            executor = self._executors.get(task_id)

            logger.info(f"[Scheduler] Task {task_id}: future={'exists' if future else 'none'}, executor={'exists' if executor else 'none'}")

            if executor:
                logger.info(f"[Scheduler] Task {task_id}: Calling executor.cancel()")
                executor.cancel()
                logger.info(f"[Scheduler] Task {task_id}: executor.cancel() returned")

            cancelled = False
            if future and not future.done():
                cancelled = future.cancel()
                logger.info(f"[Scheduler] Task {task_id}: future.cancel() = {cancelled}")

            if executor or cancelled:
                self._task_service.mark_cancelled(task_id)
                logger.info(f"[Scheduler] Task {task_id}: Marked as cancelled")
                return True

            logger.info(f"[Scheduler] Task {task_id}: Could not cancel (no executor and future already done)")
            return False


task_scheduler = TaskScheduler()
