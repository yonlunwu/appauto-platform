from __future__ import annotations

import asyncio
from concurrent.futures import Future, ThreadPoolExecutor
import threading
from typing import Any, Dict, Optional

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
        self._executors: Dict[int, Any] = {}  # 保存 task_id 到 executor 的映射，用于取消操作
        self._task_service = TaskService()
        self._result_storage = ResultStorage()
        self._started = False

    def start(self) -> None:
        self._started = True

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=False)
        self._started = False

    def submit(self, task_id: int, payload: Dict[str, Any]) -> Future:
        if not self._started:
            self.start()
        future = self._executor.submit(self._run_task, task_id, payload)
        with self._lock:
            self._futures[task_id] = future
        future.add_done_callback(lambda _: self._cleanup(task_id))
        return future

    def _run_task(self, task_id: int, payload: Dict[str, Any]) -> None:
        """执行单个测试任务

        根据任务类型选择执行器，执行测试并记录结果。

        Args:
            task_id: 任务ID
            payload: 任务参数字典，应包含：
                - task_type: 任务类型（可选，默认为 PERF_TEST_API）
                - 其他根据任务类型所需的参数
        """
        try:
            self._task_service.mark_running(task_id)

            # 获取任务记录以获取 display_id（用于文件命名）
            task_record = self._task_service.get_task(task_id)
            display_id = task_record.display_id if task_record and task_record.display_id else task_id

            # 获取任务类型，默认使用 Python API 方式（向后兼容）
            task_type_str = payload.get("task_type", "perf_test_api")
            try:
                task_type = TaskType(task_type_str)
            except ValueError:
                task_type = TaskType.PERF_TEST_API

            # 根据任务类型选择执行器
            if task_type == TaskType.PERF_TEST_API:
                # 使用 Python API 方式（原有方式，向后兼容）
                result = run_test_sync(payload)
            elif task_type == TaskType.HARDWARE_INFO:
                # 使用硬件信息收集执行器
                result = self._run_hardware_info_task(task_id, payload, display_id)
            elif task_type == TaskType.SYSTEM_MAINTENANCE:
                # 使用系统维护执行器
                result = self._run_system_maintenance_task(task_id, payload, display_id)
            else:
                # 使用命令行方式
                result = self._run_command_task(task_id, task_type, payload)

            # 处理执行结果
            if result.get("success"):
                # 检查是否是命令行任务且有 appauto 生成的文件
                summary = result.get("summary", {})
                appauto_xlsx = summary.get("output_xlsx")
                output_file = result.get("output_file")  # 硬件信息等任务直接提供结果文件

                # 硬件信息收集任务和系统维护任务：直接使用 output_file 或无需结果文件
                if task_type == TaskType.HARDWARE_INFO and output_file:
                    self._task_service.mark_completed(
                        task_id=task_id,
                        result_path=output_file,
                        summary=summary,
                    )
                elif task_type == TaskType.SYSTEM_MAINTENANCE:
                    # 系统维护任务不需要结果文件，只记录 summary
                    self._task_service.mark_completed(
                        task_id=task_id,
                        result_path="",  # 无结果文件
                        summary=summary,
                    )
                elif task_type != TaskType.PERF_TEST_API and appauto_xlsx:
                    # 使用 appauto 生成的 xlsx 文件
                    from pathlib import Path
                    import shutil

                    # appauto 生成的文件在 repo 目录下，不在平台的当前工作目录
                    # 需要使用 venv_manager 获取正确的 repo 路径
                    appauto_branch = payload.get("appauto_branch", "main")
                    venv_manager = get_venv_manager()
                    repo_path = venv_manager.get_repo_path(appauto_branch)
                    original_file = repo_path / appauto_xlsx

                    if original_file.exists():
                        # 重命名文件并移动到 results/ 目录
                        # 在原文件名前加上 display_id 前缀，保留 appauto 生成的 UUID 和时间戳
                        new_filename = f"{display_id}_{original_file.name}"
                        target_file = RESULTS_DIR / new_filename

                        # 如果目标文件已存在，先删除
                        if target_file.exists():
                            target_file.unlink()

                        # 移动文件
                        shutil.move(str(original_file), str(target_file))
                        file_path = str(target_file)

                        # 直接使用重命名后的文件
                        self._task_service.mark_completed(
                            task_id=task_id,
                            result_path=file_path,
                            summary=summary,
                        )
                    else:
                        # 文件不存在，回退到生成新文件
                        file_path = self._result_storage.persist_result(
                            task_id=display_id,
                            parameters=payload,
                            summary=summary,
                            request_rows=result.get("requests", []),
                        )
                        self._task_service.mark_completed(
                            task_id=task_id,
                            result_path=file_path,
                            summary=summary,
                        )
                else:
                    # Python API 方式：首先检查是否有 appauto 生成的文件
                    if output_file:
                        # 有 appauto 生成的文件，尝试移动到 results 目录
                        from pathlib import Path
                        import shutil

                        # output_file 可能是绝对路径或相对路径
                        original_file = Path(output_file)
                        if not original_file.is_absolute():
                            # 相对路径的话，需要相对于 appauto repo 目录
                            # 获取 appauto 分支信息
                            appauto_branch = payload.get("appauto_branch", "main")
                            venv_manager = get_venv_manager()
                            repo_path = venv_manager.get_repo_path(appauto_branch)
                            original_file = repo_path / output_file

                        if original_file.exists():
                            # 移动文件到 results 目录，使用和命令行任务相同的命名格式
                            new_filename = f"{display_id}_{original_file.name}"
                            target_file = RESULTS_DIR / new_filename

                            # 如果目标文件已存在，先删除
                            if target_file.exists():
                                target_file.unlink()

                            # 移动文件
                            shutil.move(str(original_file), str(target_file))
                            file_path = str(target_file)

                            self._task_service.mark_completed(
                                task_id=task_id,
                                result_path=file_path,
                                summary=summary,
                            )
                        else:
                            # 文件不存在，回退到生成新文件
                            file_path = self._result_storage.persist_result(
                                task_id=display_id,
                                parameters=payload,
                                summary=summary,
                                request_rows=result.get("requests", []),
                            )
                            self._task_service.mark_completed(
                                task_id=task_id,
                                result_path=file_path,
                                summary=summary,
                            )
                    else:
                        # 没有 appauto 生成的文件，使用原有逻辑生成新文件
                        file_path = self._result_storage.persist_result(
                            task_id=display_id,
                            parameters=payload,
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
                # 检查是否是取消导致的失败
                if error_message == "task_cancelled":
                    self._task_service.mark_cancelled(task_id)
                else:
                    self._task_service.mark_failed(task_id, error_message)
        except Exception as exc:  # pragma: no cover
            # 检查任务是否已被取消 - 不要覆盖 cancelled 状态
            task_record = self._task_service.get_task(task_id)
            if task_record and task_record.status == "cancelled":
                # 任务已被取消，不标记为失败
                return
            self._task_service.mark_failed(task_id, str(exc))

    def _run_hardware_info_task(
        self, task_id: int, payload: Dict[str, Any], display_id: int
    ) -> Dict[str, Any]:
        """使用硬件信息收集执行器运行任务

        Args:
            task_id: 任务ID
            payload: 任务参数
            display_id: 显示ID

        Returns:
            执行结果字典
        """
        from llm_perf_platform.executor.hardware_info_executor import HardwareInfoExecutor

        # 创建硬件信息收集执行器
        executor = HardwareInfoExecutor(
            task_id=task_id,
            timeout=payload.get("timeout", 300),
        )

        # 添加 display_id 到 payload
        payload["display_id"] = display_id

        # 在新的事件循环中执行异步任务
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            result = loop.run_until_complete(executor.execute(payload))
            return result.to_dict()
        finally:
            loop.close()

    def _run_system_maintenance_task(
        self, task_id: int, payload: Dict[str, Any], display_id: int
    ) -> Dict[str, Any]:
        """使用系统维护执行器运行任务

        Args:
            task_id: 任务ID
            payload: 任务参数
            display_id: 显示ID

        Returns:
            执行结果字典
        """
        from llm_perf_platform.executor.system_maintenance_executor import SystemMaintenanceExecutor

        # 创建系统维护执行器
        executor = SystemMaintenanceExecutor(task_id=task_id)

        # 在新的事件循环中执行异步任务
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            result = loop.run_until_complete(executor.execute(payload))
            return result.to_dict()
        finally:
            loop.close()

    def _run_command_task(
        self, task_id: int, task_type: TaskType, payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """使用命令行执行器运行任务

        Args:
            task_id: 任务ID
            task_type: 任务类型
            payload: 任务参数

        Returns:
            执行结果字典
        """
        # 获取 appauto 分支信息并确保对应的虚拟环境存在
        appauto_branch = payload.get("appauto_branch", "main")

        # 使用 VenvManager 确保环境存在
        venv_manager = get_venv_manager()
        appauto_bin_path = venv_manager.ensure_repo(appauto_branch)
        if not appauto_bin_path:
            raise RuntimeError(
                f"Failed to create or find environment for appauto branch '{appauto_branch}'. "
                f"Please check the appauto source path and git branch."
            )

        # 创建命令行执行器
        executor = CommandExecutor(
            task_id=task_id,
            command_type=task_type,
            appauto_branch=appauto_branch,
            timeout=payload.get("timeout", 3600),
        )

        # 保存 executor 引用，以便在取消时使用
        with self._lock:
            self._executors[task_id] = executor

        # 在新的事件循环中执行异步任务
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            result = loop.run_until_complete(executor.execute(payload))
            return result.to_dict()
        finally:
            loop.close()
            # 清理 executor 引用
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
        """取消指定任务

        Args:
            task_id: 任务ID

        Returns:
            bool: 是否成功取消任务
        """
        logger = get_logger(__name__)
        logger.info(f"[Scheduler] cancel_task called for task {task_id}")

        with self._lock:
            future = self._futures.get(task_id)
            executor = self._executors.get(task_id)

            logger.info(f"[Scheduler] Task {task_id}: future={'exists' if future else 'none'}, executor={'exists' if executor else 'none'}")

            # 如果任务正在运行，尝试终止执行器中的进程
            if executor:
                logger.info(f"[Scheduler] Task {task_id}: Calling executor.cancel()")
                executor.cancel()
                logger.info(f"[Scheduler] Task {task_id}: executor.cancel() returned")

            # 尝试取消 Future（只有未开始执行的任务能成功取消）
            cancelled = False
            if future and not future.done():
                cancelled = future.cancel()
                logger.info(f"[Scheduler] Task {task_id}: future.cancel() = {cancelled}")

            # 如果 executor 存在（任务正在运行）或 Future 被成功取消，都标记为已取消
            if executor or cancelled:
                self._task_service.mark_cancelled(task_id)
                logger.info(f"[Scheduler] Task {task_id}: Marked as cancelled")
                return True

            logger.info(f"[Scheduler] Task {task_id}: Could not cancel (no executor and future already done)")
            return False


task_scheduler = TaskScheduler()

