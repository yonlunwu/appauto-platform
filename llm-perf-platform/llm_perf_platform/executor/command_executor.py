"""命令行执行器

通过执行 appauto 命令行来完成各种任务：
- appauto bench evalscope: 性能测试
- appauto run pytest: 运行 pytest 测试
- appauto env deploy: 环境部署
- 其他通用命令
"""
import asyncio
import json
import shlex
from pathlib import Path
from typing import Dict, Any, Optional, List

from llm_perf_platform.executor.base_executor import (
    BaseExecutor,
    ExecutionResult,
    TaskType,
)
from llm_perf_platform.services.venv_manager import get_venv_manager


class CommandExecutor(BaseExecutor):
    """命令行执行器

    支持多种 appauto 命令类型：
    1. bench evalscope - 性能基准测试
    2. run pytest - pytest 测试
    3. env deploy - 环境部署
    4. 通用命令
    """

    def __init__(
        self,
        task_id: int,
        command_type: TaskType = TaskType.GENERIC_COMMAND,
        appauto_branch: str = "main",
        timeout: int = 3600,
    ):
        super().__init__(task_id)
        self.command_type = command_type
        self.appauto_branch = appauto_branch
        self.timeout = timeout
        self.process = None  # 保存当前运行的进程，用于取消操作
        self.process_pid = None  # 保存进程 PID，用于跨线程取消
        self.process_pgid = None  # 保存进程组 ID
        self._cancelled = False  # 标记是否已被取消

        # 使用 VenvManager 获取 venv 和 repo 路径
        self.venv_manager = get_venv_manager()
        self.venv_path = self.venv_manager.get_venv_path(appauto_branch)
        self.repo_path = self.venv_manager.get_repo_path(appauto_branch)
        self.activate_script = self.venv_manager.get_activation_script(appauto_branch)
        self.appauto_bin = self.venv_manager.get_appauto_bin_path(appauto_branch)

        self.log_info(f"Using appauto branch: {appauto_branch}")
        self.log_info(f"  Venv path: {self.venv_path}")
        self.log_info(f"  Repo path: {self.repo_path}")
        self.log_info(f"  Appauto bin: {self.appauto_bin}")

    def cancel(self):
        """取消正在运行的任务

        这个方法可能从不同的线程调用，所以我们使用保存的 PID/PGID 而不是 asyncio 对象
        """
        import os
        import signal

        self._cancelled = True

        # 使用保存的 PGID，避免访问 asyncio 对象
        if self.process_pgid:
            try:
                self.log_info(f"[Task {self.task_id}] Cancelling, killing process group {self.process_pgid} (PID {self.process_pid})")
                os.killpg(self.process_pgid, signal.SIGKILL)
                self.log_info(f"[Task {self.task_id}] Process group {self.process_pgid} killed successfully")
            except ProcessLookupError:
                self.log_info(f"[Task {self.task_id}] Process group {self.process_pgid} already terminated")
            except Exception as e:
                self.log_error(f"[Task {self.task_id}] Failed to kill process group {self.process_pgid}: {e}")
                # 降级到只杀单个进程
                if self.process_pid:
                    try:
                        os.kill(self.process_pid, signal.SIGKILL)
                        self.log_info(f"[Task {self.task_id}] Process {self.process_pid} killed with fallback method")
                    except Exception as e2:
                        self.log_error(f"[Task {self.task_id}] Failed to kill process {self.process_pid}: {e2}")
        elif self.process_pid:
            # 没有 PGID，只有 PID
            try:
                self.log_info(f"[Task {self.task_id}] Cancelling, killing process {self.process_pid}")
                os.kill(self.process_pid, signal.SIGKILL)
                self.log_info(f"[Task {self.task_id}] Process {self.process_pid} killed successfully")
            except ProcessLookupError:
                self.log_info(f"[Task {self.task_id}] Process {self.process_pid} already terminated")
            except Exception as e:
                self.log_error(f"[Task {self.task_id}] Failed to kill process {self.process_pid}: {e}")
        else:
            self.log_warning(f"[Task {self.task_id}] cancel() called but no process PID/PGID found")

    async def execute(self, payload: Dict[str, Any]) -> ExecutionResult:
        """执行命令

        Args:
            payload: 任务参数字典，必须包含：
                - command_type: 命令类型（可选，默认使用初始化时的类型）
                - 根据不同命令类型需要不同参数

        Returns:
            ExecutionResult: 执行结果
        """
        command_type = TaskType(payload.get("command_type", self.command_type))

        self.log_info(f"Starting command execution: {command_type}")

        try:
            if command_type == TaskType.PERF_TEST_CMD:
                return await self._execute_perf_test(payload)
            elif command_type == TaskType.EVAL_TEST:
                return await self._execute_eval_test(payload)
            elif command_type == TaskType.PYTEST:
                return await self._execute_pytest(payload)
            elif command_type == TaskType.ENV_DEPLOY:
                return await self._execute_env_deploy(payload)
            elif command_type == TaskType.GENERIC_COMMAND:
                return await self._execute_generic(payload)
            else:
                raise ValueError(f"Unsupported command type: {command_type}")

        except Exception as e:
            self.log_error(f"Command execution failed: {e}")
            return ExecutionResult(
                success=False,
                summary={"error": str(e)},
                error=str(e),
            )

    async def _execute_perf_test(self, payload: Dict[str, Any]) -> ExecutionResult:
        """执行性能测试命令

        使用 appauto bench evalscope perf 命令

        Args:
            payload: 必须包含：
                - base: "ft" 或 "amaas"
                - skip_launch: 是否跳过模型启动
                - ip: 服务器 IP
                - port: API 端口
                - model: 模型名称
                - parallel: 并发度
                - number: 请求数
                - input_length, output_length, loop 等
        """
        self.log_info("Executing performance test via appauto bench evalscope perf")

        base = payload.get("base", "ft")
        skip_launch = payload.get("skip_launch", True)

        # 构建命令
        cmd_parts = ["appauto", "bench", "evalscope", "perf"]

        # 添加基础场景标志
        if base == "amaas":
            cmd_parts.append("--base-amaas")
        else:
            cmd_parts.append("--base-ft")

        # 是否跳过模型启动
        if skip_launch:
            cmd_parts.append("--skip-launch")

        # 添加连接参数
        if payload.get("ip"):
            cmd_parts.extend(["--ip", payload["ip"]])
        if payload.get("port"):
            cmd_parts.extend(["--port", str(payload["port"])])

        # SSH 参数
        if payload.get("ssh_user"):
            cmd_parts.extend(["--ssh-user", payload["ssh_user"]])
        if payload.get("ssh_password"):
            cmd_parts.extend(["--ssh-password", payload["ssh_password"]])
        if payload.get("ssh_port"):
            cmd_parts.extend(["--ssh-port", str(payload["ssh_port"])])

        # 测试参数
        if payload.get("parallel"):
            cmd_parts.extend(["--parallel", str(payload["parallel"])])
        if payload.get("number"):
            cmd_parts.extend(["--number", str(payload["number"])])

        # 模型参数
        if payload.get("model"):
            cmd_parts.extend(["--model", payload["model"]])

        # 如果不跳过启动，需要 tp 参数
        if not skip_launch:
            if payload.get("tp"):
                cmd_parts.extend(["--tp", str(payload["tp"])])
            if payload.get("launch_timeout"):
                cmd_parts.extend(["--launch-timeout", str(payload["launch_timeout"])])

        # 可选参数
        if payload.get("tokenizer_path"):
            cmd_parts.extend(["--tokenizer-path", payload["tokenizer_path"]])
        if payload.get("input_length"):
            cmd_parts.extend(["--input-length", str(payload["input_length"])])
        if payload.get("output_length"):
            cmd_parts.extend(["--output-length", str(payload["output_length"])])
        if payload.get("loop"):
            cmd_parts.extend(["--loop", str(payload["loop"])])
        if payload.get("debug"):
            cmd_parts.append("--debug")
        if payload.get("keep_model"):
            cmd_parts.append("--keep-model")

        # 执行命令（appauto 会自动生成输出文件）
        return await self._run_command(cmd_parts)


    async def _execute_eval_test(self, payload: Dict[str, Any]) -> ExecutionResult:
        """执行正确性测试命令
        
        使用 appauto bench evalscope eval 命令
        
        Args:
            payload: 必须包含：
                - base: "ft" 或 "amaas"
                - skip_launch: 是否跳过模型启动
                - ip: 服务器 IP
                - port: API 端口
                - model: 模型名称
                - dataset: 数据集名称
                - concurrency: 并发度
                - temperature: 温度参数
                等评测参数
        """
        self.log_info("Executing correctness test via appauto bench evalscope eval")
        
        base = payload.get("base", "ft")
        skip_launch = payload.get("skip_launch", True)
        
        # 构建命令
        cmd_parts = ["appauto", "bench", "evalscope", "eval"]
        
        # 添加基础场景标志
        if base == "amaas":
            cmd_parts.append("--base-amaas")
        else:
            cmd_parts.append("--base-ft")
        
        # 是否跳过模型启动
        if skip_launch:
            cmd_parts.append("--skip-launch")
        
        # 添加连接参数
        if payload.get("ip"):
            cmd_parts.extend(["--ip", payload["ip"]])
        if payload.get("port"):
            cmd_parts.extend(["--port", str(payload["port"])])
        
        # SSH 参数
        if payload.get("ssh_user"):
            cmd_parts.extend(["--ssh-user", payload["ssh_user"]])
        if payload.get("ssh_password"):
            cmd_parts.extend(["--ssh-password", payload["ssh_password"]])
        if payload.get("ssh_port"):
            cmd_parts.extend(["--ssh-port", str(payload["ssh_port"])])
        
        # 模型参数
        if payload.get("model"):
            cmd_parts.extend(["--model", payload["model"]])
        
        # 如果不跳过启动，需要 tp 和 launch_timeout 参数
        if not skip_launch:
            if payload.get("tp"):
                cmd_parts.extend(["--tp", str(payload["tp"])])
            if payload.get("launch_timeout"):
                cmd_parts.extend(["--launch-timeout", str(payload["launch_timeout"])])
        
        # 评测参数
        if payload.get("dataset"):
            cmd_parts.extend(["--dataset", payload["dataset"]])
        if payload.get("dataset_args"):
            cmd_parts.extend(["--dataset-args", payload["dataset_args"]])
        if payload.get("max_tokens"):
            cmd_parts.extend(["--max-tokens", str(payload["max_tokens"])])
        if payload.get("concurrency"):
            cmd_parts.extend(["--concurrency", str(payload["concurrency"])])
        if payload.get("limit"):
            cmd_parts.extend(["--limit", str(payload["limit"])])
        if payload.get("temperature") is not None:
            cmd_parts.extend(["--temperature", str(payload["temperature"])])
        
        # 可选标志
        if payload.get("enable_thinking"):
            cmd_parts.append("--enable-thinking")
        if payload.get("keep_model"):
            cmd_parts.append("--keep-model")
        if payload.get("debug"):
            cmd_parts.append("--debug")
        
        # 执行命令
        return await self._run_command(cmd_parts)


    async def _execute_pytest(self, payload: Dict[str, Any]) -> ExecutionResult:
        """执行 pytest 测试

        使用 appauto run pytest 命令

        Args:
            payload: 可以包含：
                - scenario: "amaas" 或 "ft"（用于确定默认 testpaths）
                - ssh_config: SSH 配置
                - testpaths: 测试文件路径（可选）
                - case_level: 测试级别（可选）
                - model_priority: 模型优先级（可选）
                - lark_user: 飞书用户（可选）
                - topic: 主题（可选）
                - notify_group: 通知组（可选）
                - report_server: 报告服务器（可选）
                - pytest_args: pytest 额外参数（可选）
        """
        self.log_info("Executing pytest via appauto run pytest")

        scenario = payload.get("scenario", "amaas")
        ssh_config = payload.get("ssh_config", {})

        # 构建命令
        cmd_parts = ["appauto", "run", "pytest"]

        # 添加飞书用户（可选）
        lark_user = payload.get("lark_user")
        if lark_user:
            cmd_parts.append(f"--lark-user={lark_user}")

        # 添加主题（可选）
        topic = payload.get("topic")
        if topic:
            cmd_parts.append(f"--topic={topic}")

        # 添加测试路径
        testpaths = payload.get("testpaths")
        if not testpaths:
            # 根据场景设置默认测试路径
            if scenario == "amaas":
                testpaths = "testcases/sanity_check/amaas/test_amaas.py"
            else:
                testpaths = "testcases/sanity_check/ft/test_ft.py"
        cmd_parts.append(f"--testpaths={testpaths}")

        # 添加通知组（可选）- 必须在 testpaths 之后，作为额外参数传递
        notify_group = payload.get("notify_group")
        if notify_group:
            cmd_parts.append(f"--notify-group={notify_group}")

        # 添加报告服务器（可选）
        report_server = payload.get("report_server")
        if report_server:
            cmd_parts.append(f"--report-server={report_server}")

        # 添加报告 URL（可选）
        report_url = payload.get("report_url")
        if report_url:
            cmd_parts.append(f"--report-url={report_url}")

        # 以下参数作为额外参数传递（使用 --key=value 格式）
        # 这些参数会被 appauto 的 parse_extra_args 解析并写入 test_data.ini

        # 添加 IP（从 ssh_config 获取）
        if ssh_config and ssh_config.get("host"):
            cmd_parts.append(f"--ip={ssh_config['host']}")

        # 添加 FT 端口（FT场景特有）
        if scenario == "ft":
            ft_port = payload.get("ft_port", 35000)
            cmd_parts.append(f"--ft_port={ft_port}")

        # 添加测试级别
        case_level = payload.get("case_level")
        if case_level:
            cmd_parts.append(f"--case-level={case_level}")

        # 添加模型优先级
        model_priority = payload.get("model_priority")
        if model_priority:
            cmd_parts.append(f"--model_priority={model_priority}")

        # 添加 SSH 用户和端口
        if ssh_config:
            if ssh_config.get("user"):
                cmd_parts.append(f"--ssh_user={ssh_config['user']}")
            if ssh_config.get("port"):
                cmd_parts.append(f"--ssh_port={ssh_config['port']}")

        # 添加 GPU 配置（可选）
        need_empty_gpu_count = payload.get("need_empty_gpu_count")
        if need_empty_gpu_count is not None:
            cmd_parts.append(f"--need_empty_gpu_count={need_empty_gpu_count}")

        # 添加 TP 配置（可选）
        tp = payload.get("tp")
        if tp:
            cmd_parts.append(f"--tp={tp}")

        # 添加额外的 pytest 参数
        pytest_args = payload.get("pytest_args")
        if pytest_args:
            if isinstance(pytest_args, str):
                pytest_args = shlex.split(pytest_args)
            if isinstance(pytest_args, list):
                cmd_parts.extend(pytest_args)

        # pytest 需要在 appauto 源码目录下运行
        if not self.repo_path.exists():
            self.log_error(f"Appauto source directory not found: {self.repo_path}")
            raise FileNotFoundError(f"Appauto source directory not found: {self.repo_path}")

        self.log_info(f"Running pytest in appauto source directory: {self.repo_path}")
        return await self._run_command(cmd_parts, cwd=str(self.repo_path))

    async def _execute_env_deploy(self, payload: Dict[str, Any]) -> ExecutionResult:
        """执行环境部署

        使用 appauto env deploy 命令

        Args:
            payload: 必须包含：
                - deploy_type: "amaas" 或 "ft"
                - ip: IP 地址
                - tag: 标签
                - tar_name: tar 包名称
                - ssh_user: SSH 用户名（可选，默认 qujing）
                - ssh_password: SSH 密码（可选）
                - ssh_port: SSH 端口（可选，默认 22）
                - user: 用户信息（可选，用于消息卡片）

                FT 特有参数：
                - image: 镜像名称（FT 部署必需）
        """
        self.log_info("Executing environment deployment via appauto env deploy")

        deploy_type = payload.get("deploy_type")
        if not deploy_type or deploy_type not in ["amaas", "ft"]:
            raise ValueError("deploy_type must be 'amaas' or 'ft'")

        # 构建命令
        cmd_parts = ["appauto", "env", "deploy", deploy_type]

        # 添加必需参数
        if payload.get("ip"):
            cmd_parts.extend(["--ip", payload["ip"]])

        # FT 需要 image 参数
        if deploy_type == "ft":
            if not payload.get("image"):
                raise ValueError("image is required for FT deployment")
            cmd_parts.extend(["--image", payload["image"]])

        if payload.get("tag"):
            cmd_parts.extend(["--tag", payload["tag"]])
        if payload.get("tar_name"):
            cmd_parts.extend(["--tar-name", payload["tar_name"]])

        # 添加 SSH 参数
        if payload.get("ssh_user"):
            cmd_parts.extend(["--ssh-user", payload["ssh_user"]])
        if payload.get("ssh_password"):
            cmd_parts.extend(["--ssh-password", payload["ssh_password"]])
        if payload.get("ssh_port"):
            cmd_parts.extend(["--ssh-port", str(payload["ssh_port"])])

        # 添加用户信息（用于消息卡片）
        if payload.get("user"):
            cmd_parts.extend(["--user", payload["user"]])

        return await self._run_command(cmd_parts)

    async def _execute_generic(self, payload: Dict[str, Any]) -> ExecutionResult:
        """执行通用命令

        Args:
            payload: 必须包含：
                - command: 完整的命令字符串或命令数组
        """
        self.log_info("Executing generic appauto command")

        command = payload.get("command")
        if not command:
            raise ValueError("command is required for generic execution")

        # 支持字符串或数组格式
        if isinstance(command, str):
            cmd_parts = shlex.split(command)
        else:
            cmd_parts = command

        # 如果命令不是以 appauto 开头，添加前缀
        if cmd_parts[0] != "appauto" and not cmd_parts[0].endswith("appauto"):
            cmd_parts = ["appauto"] + cmd_parts

        return await self._run_command(cmd_parts)

    async def _run_command(
        self,
        cmd_parts: List[str],
        output_file: Optional[str] = None,
        cwd: Optional[str] = None,
    ) -> ExecutionResult:
        """运行命令并捕获输出（通过激活 venv 的方式）

        Args:
            cmd_parts: 命令参数列表
            output_file: 预期的输出文件路径
            cwd: 工作目录（可选，默认为 repo 路径）

        Returns:
            ExecutionResult: 执行结果
        """
        # 默认使用 repo 路径作为工作目录
        if cwd is None:
            cwd = str(self.repo_path)

        cmd_str = " ".join(shlex.quote(part) for part in cmd_parts)
        self.log_info(f"Running command: {cmd_str}")
        self.log_info(f"Working directory: {cwd}")
        self.log_info(f"Activating venv: {self.activate_script}")

        # 构建通过激活 venv 执行命令的完整命令
        # 使用 bash -c "source activate && cd repo && command"
        full_command = f"source {self.activate_script} && cd {cwd} && {cmd_str}"

        try:
            # 使用 bash -c 执行完整命令
            # start_new_session=True 会创建新的进程组，方便后续一次性终止整个进程树
            process = await asyncio.create_subprocess_exec(
                "bash",
                "-c",
                full_command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                start_new_session=True,  # 创建新的会话和进程组
            )

            # 保存进程对象，以便可以在取消时终止它
            self.process = process
            self.process_pid = process.pid

            # 获取进程组 ID（由于使用了 start_new_session=True，PID 应该等于 PGID）
            import os
            try:
                self.process_pgid = os.getpgid(process.pid)
                self.log_info(f"[Task {self.task_id}] Process started: PID={self.process_pid}, PGID={self.process_pgid}")
            except Exception as e:
                self.log_warning(f"[Task {self.task_id}] Could not get PGID: {e}")
                self.process_pgid = process.pid  # 降级：假设 PGID == PID

            # 等待命令完成（带超时）
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=self.timeout,
                )
            except asyncio.TimeoutError:
                # 超时，终止整个进程组
                self.log_info(f"Command timeout, killing process group")
                try:
                    import os
                    import signal
                    pgid = os.getpgid(process.pid)
                    os.killpg(pgid, signal.SIGKILL)
                except Exception as e:
                    self.log_error(f"Failed to kill process group: {e}")
                    process.kill()
                await process.wait()
                raise TimeoutError(f"Command timeout after {self.timeout} seconds")
            except asyncio.CancelledError:
                # 任务被取消，终止整个进程组
                self.log_info(f"Task cancelled, killing process group")
                try:
                    import os
                    import signal
                    pgid = os.getpgid(process.pid)
                    os.killpg(pgid, signal.SIGKILL)
                except Exception as e:
                    self.log_error(f"Failed to kill process group: {e}")
                    process.kill()
                await process.wait()
                raise
            finally:
                # 清理进程引用
                self.process = None
                self.process_pid = None
                self.process_pgid = None

            # 解码输出
            stdout_str = stdout.decode("utf-8") if stdout else ""
            stderr_str = stderr.decode("utf-8") if stderr else ""

            # 记录输出
            if stdout_str:
                self.log_info(f"STDOUT: {stdout_str}")
            if stderr_str:
                self.log_error(f"STDERR: {stderr_str}")

            # 检查退出码
            exit_code = process.returncode

            # 如果任务被取消（通过 cancel() 方法），且进程被 SIGKILL 杀掉（exit code -9）
            # 返回特殊的取消标记
            if self._cancelled and exit_code == -9:
                self.log_info(f"[Task {self.task_id}] Process was killed due to cancellation (exit code: {exit_code})")
                return ExecutionResult(
                    success=False,
                    summary={"exit_code": exit_code},
                    error="task_cancelled",  # 特殊标记：任务被取消
                    stdout=stdout_str,
                    stderr=stderr_str,
                    exit_code=exit_code,
                )

            success = exit_code == 0

            # 尝试从输出中解析结果
            summary = self._parse_output(stdout_str, stderr_str)
            summary["exit_code"] = exit_code

            # 如果没有传入 output_file，尝试从 summary 中提取
            # appauto 会在输出中返回生成的文件路径
            if not output_file and "output_xlsx" in summary:
                output_file = summary["output_xlsx"]
                self.log_info(f"Detected output file from appauto: {output_file}")

            # 检查常见错误模式（即使exit code为0）
            # 但如果生成了输出文件，优先认为任务成功
            error_patterns = [
                ("Connection refused", "Connection to model server refused"),
                ("Connection error", "Connection to model server failed"),
                ("ConnectError", "Network connection error"),
                ("TimeoutError", "Request timeout"),
                ("eval finished. score:\n", "Evaluation completed but no score obtained"),
                ("eval finished. score: \n", "Evaluation completed but no score obtained"),
            ]

            combined_output = stdout_str + "\n" + stderr_str

            # 只有在没有生成输出文件时，才检查错误模式
            if not output_file:
                for pattern, error_desc in error_patterns:
                    if pattern in combined_output:
                        success = False
                        error_msg = f"{error_desc} (detected pattern: {pattern})"
                        self.log_error(error_msg)
                        return ExecutionResult(
                            success=False,
                            summary=summary,
                            error=error_msg,
                            stdout=stdout_str,
                            stderr=stderr_str,
                            exit_code=exit_code,
                        )
            else:
                # 如果生成了输出文件，即使有错误模式也认为任务成功
                # 这是因为 appauto 可能在重试后成功完成了测试
                if not success:
                    self.log_info(f"Command had non-zero exit code {exit_code}, but output file was generated: {output_file}")
                    success = True

            # 对于评测任务，需要额外验证 score 是否有效
            if success and self.command_type == TaskType.EVAL_TEST:
                if "score" not in summary or summary["score"] is None:
                    success = False
                    error_msg = "Evaluation task completed but no valid score was obtained"
                    self.log_error(error_msg)
                    return ExecutionResult(
                        success=False,
                        summary=summary,
                        error=error_msg,
                        stdout=stdout_str,
                        stderr=stderr_str,
                        exit_code=exit_code,
                    )

            if not success:
                error_msg = stderr_str or f"Command failed with exit code {exit_code}"
                self.log_error(f"Command failed: {error_msg}")
                return ExecutionResult(
                    success=False,
                    summary=summary,
                    error=error_msg,
                    stdout=stdout_str,
                    stderr=stderr_str,
                    exit_code=exit_code,
                )

            self.log_info("Command completed successfully")
            return ExecutionResult(
                success=True,
                summary=summary,
                output_file=output_file,
                stdout=stdout_str,
                stderr=stderr_str,
                exit_code=exit_code,
            )

        except Exception as e:
            self.log_error(f"Command execution error: {e}")
            return ExecutionResult(
                success=False,
                summary={"error": str(e)},
                error=str(e),
            )


    def _parse_output(self, stdout: str, stderr: str) -> Dict[str, Any]:
        """解析命令输出

        尝试从输出中提取结构化信息，包括 appauto 生成的文件路径

        Args:
            stdout: 标准输出
            stderr: 错误输出

        Returns:
            解析后的摘要信息
        """
        summary = {}

        # 尝试从 stdout 中查找 JSON 输出
        # appauto 可能会输出 JSON 格式的结果
        try:
            # 查找 JSON 块
            for line in stdout.split("\n"):
                line = line.strip()
                if line.startswith("{") and line.endswith("}"):
                    try:
                        data = json.loads(line)
                        summary.update(data)
                    except json.JSONDecodeError:
                        pass
        except Exception:
            pass

        # 解析 appauto 生成的文件路径
        # 查找类似 "The performance test data has been saved to: xxx.csv, xxx.xlsx" 的行
        import re
        xlsx_pattern = r'saved to:.*?([a-f0-9\-]+_\d{8}_\d{6}\.xlsx)'
        csv_pattern = r'saved to:.*?([a-f0-9\-]+_\d{8}_\d{6}\.csv)'

        # 解析 evalscope 评测分数
        # 查找类似 "score: 1.0" 或 "eval finished. score: 1.0" 的行
        score_pattern = r'score:\s*([0-9.]+)'

        # 解析 pytest 的 allure 报告链接
        # 查找类似 "test_report: http://192.168.108.16:8000/reports/allure-results/..." 的行
        allure_report_pattern = r'test_report:\s*(https?://[^\s]+)'

        for line in stdout.split("\n"):
            xlsx_match = re.search(xlsx_pattern, line)
            if xlsx_match:
                summary["output_xlsx"] = xlsx_match.group(1)
                self.log_info(f"Found appauto generated xlsx: {xlsx_match.group(1)}")

            csv_match = re.search(csv_pattern, line)
            if csv_match:
                summary["output_csv"] = csv_match.group(1)
                self.log_info(f"Found appauto generated csv: {csv_match.group(1)}")

            # 提取评测分数 (使用 search 而不是 match，允许行中任意位置出现 score)
            score_match = re.search(score_pattern, line)
            if score_match and "score" not in summary:  # 只保存第一个找到的分数
                score_value = float(score_match.group(1))
                summary["score"] = score_value
                self.log_info(f"Found evaluation score: {score_value}")

            # 提取 allure 报告链接
            allure_match = re.search(allure_report_pattern, line)
            if allure_match and "allure_report" not in summary:
                allure_url = allure_match.group(1)
                summary["allure_report"] = allure_url
                self.log_info(f"Found allure report URL: {allure_url}")

        # 如果没有找到 JSON，提取一些基本信息
        if not summary:
            summary["raw_output"] = stdout[:1000]  # 只保留前1000字符

        return summary
