"""测试执行器 - 基于 appauto Python API 的测试执行

本平台是任务管理平台，不实现测试逻辑。
所有测试执行都通过 appauto 来完成。

核心功能：
1. 任务管理：创建、跟踪、记录
2. 调用 appauto Python API：将参数传递给 appauto 执行
3. 结果收集：获取 appauto 的执行结果并保存

多版本支持：
- 支持为每个任务指定不同的 appauto 分支版本
- 使用 VenvManager 管理独立的虚拟环境
- 每个分支版本有自己的 appauto 安装
"""
import asyncio
import logging
from llm_perf_platform.utils.logging_config import get_logger
import sys
import subprocess
from typing import Dict, Any, Optional
from pathlib import Path

from llm_perf_platform.executor.base_executor import (
    BaseExecutor,
    ExecutionResult,
)
from llm_perf_platform.services.venv_manager import get_venv_manager

logger = get_logger(__name__)

# appauto 导入
try:
    from appauto.operator.amaas_node import AMaaSNodeCli
    from appauto.operator.amaas_node.cli.components.ft_ctn import FTContainer
    from appauto.tool.evalscope.perf import EvalscopePerf
    APPAUTO_AVAILABLE = True
except ImportError as e:
    logging.warning(f"appauto not available: {e}")
    APPAUTO_AVAILABLE = False
    AMaaSNodeCli = None
    FTContainer = None
    EvalscopePerf = None


class TestExecutor(BaseExecutor):
    """测试执行器（使用 appauto Python API）

    不实现测试逻辑，只负责：
    1. 解析任务参数
    2. 调用 appauto Python API 执行测试
    3. 收集结果
    """

    def __init__(self, task_id: int, appauto_branch: Optional[str] = None):
        super().__init__(task_id)
        self.appauto_branch = appauto_branch or "main"
        logging.info(f"[Task {task_id}] Initializing TestExecutor with appauto_branch='{self.appauto_branch}' (raw input: {appauto_branch})")
        self.venv_manager = get_venv_manager()

        # Ensure the venv exists for the specified branch
        self.appauto_bin_path = self.venv_manager.ensure_venv(self.appauto_branch)
        if not self.appauto_bin_path:
            raise RuntimeError(
                f"Failed to create or find venv for appauto branch '{self.appauto_branch}'. "
                f"Please check the appauto source path and git branch."
            )

        self.log_info(f"Using appauto from branch '{self.appauto_branch}' at {self.appauto_bin_path}")

        # For backwards compatibility, check if default appauto is available
        if not APPAUTO_AVAILABLE and self.appauto_branch == "main":
            logging.warning("Default appauto not available, using branch-specific version")

    async def execute(self, payload: Dict[str, Any]) -> ExecutionResult:
        """执行测试任务

        Args:
            payload: 任务参数字典

        Returns:
            ExecutionResult: 统一的执行结果
        """
        task_id = payload["task_id"]
        engine = payload["engine"]
        model = payload["model"]
        input_length = payload["input_length"]
        output_length = payload["output_length"]
        concurrency = payload["concurrency"]
        loop = payload.get("loop", 1)
        scenario = payload.get("scenario", "ft")
        ssh_config = payload.get("ssh_config")
        port = payload.get("model_port", 30000)

        self.log_info(
            f"Starting test execution via appauto API: "
            f"scenario={scenario}, engine={engine}, model={model}"
        )

        try:
            # 从 payload 中移除已显式传递的参数，避免重复
            extra_params = {k: v for k, v in payload.items() if k not in [
                'task_id', 'engine', 'model', 'input_length', 'output_length',
                'concurrency', 'loop', 'scenario', 'ssh_config', 'model_port', 'port'
            ]}

            result = await self.execute_test(
                task_id=task_id,
                engine=engine,
                model=model,
                input_length=input_length,
                output_length=output_length,
                concurrency=concurrency,
                loop=loop,
                scenario=scenario,
                ssh_config=ssh_config,
                port=port,
                **extra_params
            )
            return result

        except Exception as e:
            self.log_error(f"Test execution failed: {e}")
            return ExecutionResult(
                success=False,
                summary={"error": str(e)},
                error=str(e),
            )

    async def execute_test(
        self,
        task_id: int,
        engine: str,
        model: str,
        input_length: int,
        output_length: int,
        concurrency: int,
        loop: int = 1,
        scenario: str = "ft",  # amaas 或 ft
        ssh_config: Optional[Dict[str, Any]] = None,
        port: int = 30000,
        **kwargs
    ) -> ExecutionResult:
        """执行性能测试

        Args:
            task_id: 任务ID
            engine: 引擎名称
            model: 模型名称
            input_length: 输入长度
            output_length: 输出长度
            concurrency: 并发数
            loop: 循环次数
            scenario: 测试场景（amaas/ft）
            ssh_config: SSH配置
            port: 模型端口
            **kwargs: 其他参数

        Returns:
            ExecutionResult: 执行结果
        """
        self.log_info(
            f"Starting test execution via appauto: "
            f"scenario={scenario}, engine={engine}, model={model}"
        )

        # 检查是否需要SSH配置
        execution_mode = kwargs.get("execution_mode", "remote")
        if execution_mode == "remote" and not ssh_config:
            raise ValueError("ssh_config is required for remote testing. Please configure SSH connection in the test form.")

        try:
            if scenario == "ft":
                return await self._execute_ft_test(
                    task_id=task_id,
                    ssh_config=ssh_config,
                    engine=engine,
                    model=model,
                    input_length=input_length,
                    output_length=output_length,
                    concurrency=concurrency,
                    loop=loop,
                    port=port,
                    **kwargs
                )
            elif scenario == "amaas":
                return await self._execute_amaas_test(
                    task_id=task_id,
                    ssh_config=ssh_config,
                    engine=engine,
                    model=model,
                    input_length=input_length,
                    output_length=output_length,
                    concurrency=concurrency,
                    loop=loop,
                    port=10011,
                    **kwargs
                )
            else:
                raise ValueError(f"Unsupported scenario: {scenario}")

        except Exception as e:
            self.log_error(f"Test execution failed: {e}")
            return ExecutionResult(
                success=False,
                summary={},
                error=str(e),
            )

    async def _execute_ft_test(
        self,
        task_id: int,
        ssh_config: Dict[str, Any],
        engine: str,
        model: str,
        input_length: int,
        output_length: int,
        concurrency: int,
        loop: int,
        port: int,
        **kwargs
    ) -> ExecutionResult:
        """通过 FT 容器执行测试"""
        self.log_info("Executing test via FT container")

        # 初始化 AMaaSNodeCli
        cli = AMaaSNodeCli(
            mgt_ip=ssh_config["host"],
            ssh_user=ssh_config["user"],
            ssh_password=ssh_config.get("password"),
            ssh_port=ssh_config.get("port", 22),
        )

        # 初始化 FT 容器
        ft_container = FTContainer(
            node=cli,
            name=kwargs.get("ft_container_name", "zhiwen-ft"),
            conda_env=kwargs.get("ft_conda_env", "ftransformers"),
            engine=engine,
        )

        # 检查是否需要拉起模型
        auto_launch_model = kwargs.get("auto_launch_model", False)
        stop_model_after_test = kwargs.get("stop_model_after_test", False)
        model_path = kwargs.get("model_path", model)
        model_tp = kwargs.get("model_tp", 1)
        model_mode = kwargs.get("model_mode", "correct")

        try:
            # 如果需要拉起模型
            if auto_launch_model:
                self.log_info(f"Launching model: {model_path}, tp={model_tp}, mode={model_mode}, port={port}")

                # 拉起模型（在线程中运行，等待模型启动完成）
                ft_container.launch_model_in_thread(
                    model_path,
                    tp=model_tp,
                    mode=model_mode,
                    port=port,
                    wait_for_running=True
                )

                self.log_info("Model launched successfully, waiting for it to be ready...")

                # 等待一段时间确保模型完全就绪
                import asyncio
                await asyncio.sleep(5)

                # 验证模型已启动
                pids = ft_container.get_running_model_pids(engine, model_path)
                if not pids:
                    raise RuntimeError(f"Failed to launch model {model_path}: no running PIDs found")

                self.log_info(f"Model is running with PIDs: {pids}")

            # 执行性能测试
            self.log_info("Running performance test...")
            output_xlsx = ft_container.run_perf_via_evalscope(
                port,
                model,
                concurrency,  # 从1到concurrency
                concurrency,
                input_length,
                output_length,
                loop=loop,
                debug=kwargs.get("debug", False),
                tokenizer_path=kwargs.get("tokenizer_path"),
            )
            
            self.log_info("Performance test completed")

            # 如果需要停止模型
            if auto_launch_model and stop_model_after_test:
                self.log_info(f"Stopping model: {model_path}")
                ft_container.stop_model(model_path)

                # 验证模型已停止
                pids = ft_container.get_running_model_pids(engine, model_path)
                if pids:
                    self.log_error(f"Warning: Model may still be running with PIDs: {pids}")
                else:
                    self.log_info("Model stopped successfully")

            return ExecutionResult(
                success=True,
                summary={
                    "engine": engine,
                    "model": model,
                    "model_path": model_path,
                    "input_length": input_length,
                    "output_length": output_length,
                    "concurrency": concurrency,
                    "loop": loop,
                    "auto_launch_model": auto_launch_model,
                    "stop_model_after_test": stop_model_after_test,
                    "output_xlsx": output_xlsx,
                },
                requests=[],  # TODO: 解析 appauto 生成的详细数据
                output_file=output_xlsx
            )

        except Exception as e:
            self.log_error(f"FT test execution failed: {e}")

            # 如果拉起了模型且发生错误，尝试停止模型
            if auto_launch_model:
                try:
                    self.log_info(f"Attempting to stop model after error: {model_path}")
                    ft_container.stop_model(model_path)
                except Exception as stop_error:
                    self.log_error(f"Failed to stop model: {stop_error}")

            raise

    async def _execute_amaas_test(
        self,
        task_id: int,
        ssh_config: Dict[str, Any],
        engine: str,
        model: str,
        input_length: int,
        output_length: int,
        concurrency: int,
        loop: int,
        port: int,
        **kwargs
    ) -> ExecutionResult:
        """通过 AMaaS 执行测试"""
        self.log_info("Executing test via AMaaS")

        # 检查是否需要拉起模型
        auto_launch_model = kwargs.get("auto_launch_model", False)
        stop_model_after_test = kwargs.get("stop_model_after_test", False)
        model_path = kwargs.get("model_path", model)
        model_tp = kwargs.get("model_tp", 1)
        amaas_api_port = kwargs.get("amaas_api_port", 10001)
        amaas_api_user = kwargs.get("amaas_api_user", "admin")
        amaas_api_passwd = kwargs.get("amaas_api_passwd", "123456")

        try:
            from appauto.operator.amaas_node import AMaaSNode
            
            # 初始化 AMaaSNode
            amaas = AMaaSNode(
                mgt_ip=ssh_config["host"],
                ssh_user=ssh_config["user"],
                ssh_password=ssh_config.get("password"),
                ssh_port=ssh_config.get("port", 22),
                api_port=amaas_api_port,
                api_user=amaas_api_user,
                api_passwd=amaas_api_passwd,
            )

            # 如果需要拉起模型
            if auto_launch_model:
                self.log_info(f"Launching model via AMaaS: {model_path}, tp={model_tp}, port={amaas_api_port}")

                # 获取 model_store
                self.log_info(f"Getting model_store for: {model_path}")
                model_store = amaas.api.init_model_store.llm.filter(name=model_path)[0]

                # 拉起模型（使用性能测试参数）
                self.log_info(f"Launching model with perf params: tp={model_tp}")
                amaas.api.launch_model_with_perf(tp=model_tp, model_store=model_store)

                self.log_info("Model launched successfully")

                # 等待一段时间确保模型完全就绪
                import asyncio
                await asyncio.sleep(5)

            # 初始化 AMaaSNodeCli（用于性能测试）
            cli = AMaaSNodeCli(
                mgt_ip=ssh_config["host"],
                ssh_user=ssh_config["user"],
                ssh_password=ssh_config.get("password"),
                ssh_port=ssh_config.get("port", 22),
            )

            # 执行性能测试
            self.log_info("Running performance test...")
            # EvalscopePerf参数: cli, model, host, port, parallel_min, parallel_max,
            #                    api_key, tokenizer_path, input_len, output_len, loop, debug
            evalscope = EvalscopePerf(
                cli,
                model,
                "127.0.0.1",
                10011,
                concurrency,
                concurrency,
                amaas.api.api_keys[0].value,  # API key
                f"/mnt/data/models/{model}",   # tokenizer_path
                input_length,
                output_length,
                loop=loop,
                debug=kwargs.get("debug", False),
            )

            evalscope.run_perf()

            # 获取输出文件
            output_xlsx = getattr(evalscope, 'output_xlsx', None)
            if not output_xlsx:
                self.log_error("Warning: evalscope.output_xlsx is empty, performance test may have failed")

            self.log_info("Performance test completed")

            # 如果需要停止模型
            if auto_launch_model and stop_model_after_test:
                self.log_info(f"Stopping model: {model_path}")
                amaas.api.stop_model(model_store, "llm")
                self.log_info("Model stopped successfully")

            return ExecutionResult(
                success=True,
                summary={
                    "engine": engine,
                    "model": model,
                    "model_path": model_path,
                    "input_length": input_length,
                    "output_length": output_length,
                    "concurrency": concurrency,
                    "loop": loop,
                    "auto_launch_model": auto_launch_model,
                    "stop_model_after_test": stop_model_after_test,
                    "output_xlsx": output_xlsx,
                },
                requests=[],  # TODO: 解析 appauto 生成的详细数据
                output_file=output_xlsx,
            )

        except Exception as e:
            import traceback
            self.log_error(f"AMaaS test execution failed: {e}")
            self.log_error(f"Traceback: {traceback.format_exc()}")

            # 如果拉起了模型且发生错误，尝试停止模型
            if auto_launch_model:
                try:
                    self.log_info(f"Attempting to stop model after error: {model_path}")
                    amaas.api.stop_model(model_store, "llm")
                except Exception as stop_error:
                    self.log_error(f"Failed to stop model: {stop_error}")

            raise


def run_test_sync(task_payload: Dict[str, Any]) -> Dict[str, Any]:
    """同步执行测试（供 ThreadPoolExecutor 使用）

    Args:
        task_payload: 任务参数字典

    Returns:
        测试结果字典（向后兼容格式）
    """
    task_id = task_payload["task_id"]
    appauto_branch = task_payload.get("appauto_branch", "main")
    executor = TestExecutor(task_id, appauto_branch=appauto_branch)

    # 在新的事件循环中执行异步测试
    loop_obj = asyncio.new_event_loop()
    asyncio.set_event_loop(loop_obj)

    try:
        result = loop_obj.run_until_complete(executor.execute(task_payload))
        # 转换为向后兼容的字典格式
        return result.to_dict()
    finally:
        loop_obj.close()
