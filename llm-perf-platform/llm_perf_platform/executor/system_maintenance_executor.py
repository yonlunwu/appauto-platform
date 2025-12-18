"""系统维护执行器

用于执行系统维护任务，如更新 appauto 代码和虚拟环境
"""
import os
import asyncio
from pathlib import Path
from typing import Dict, Any
from datetime import datetime

from llm_perf_platform.executor.base_executor import BaseExecutor, ExecutionResult


class SystemMaintenanceExecutor(BaseExecutor):
    """系统维护执行器

    支持的操作：
    1. 更新 appauto 代码（git pull）
    2. 更新/创建指定分支的虚拟环境
    """

    def __init__(self, task_id: int):
        super().__init__(task_id)
        # appauto 代码路径（从环境变量读取）
        appauto_path_str = os.getenv("APPAUTO_PATH")
        if not appauto_path_str:
            raise RuntimeError("APPAUTO_PATH environment variable is not set. Please configure it in the systemd service file.")
        self.appauto_path = Path(appauto_path_str)
        # venv 基础路径
        self.venv_base_path = Path.home() / ".local/share/llm-perf/venvs"

    async def execute(self, payload: Dict[str, Any]) -> ExecutionResult:
        """执行系统维护任务

        Args:
            payload: 包含以下字段的字典
                - operation: 操作类型 ("update_appauto")
                - branch: 要更新的分支名（如 "main", "v3.3.1"）

        Returns:
            ExecutionResult: 执行结果
        """
        operation = payload.get("operation", "update_appauto")
        branch = payload.get("branch", "main")

        self.log_info(f"开始系统维护操作: {operation}, 分支: {branch}")

        try:
            if operation == "update_appauto":
                return await self._update_appauto(branch)
            else:
                error_msg = f"未知的操作类型: {operation}"
                self.log_error(error_msg)
                return ExecutionResult(
                    success=False,
                    summary={"error": error_msg},
                    error=error_msg
                )
        except Exception as e:
            error_msg = f"系统维护失败: {str(e)}"
            self.log_error(error_msg)
            return ExecutionResult(
                success=False,
                summary={"error": error_msg},
                error=error_msg
            )

    async def _update_appauto(self, branch: str) -> ExecutionResult:
        """更新 appauto 代码和虚拟环境

        步骤：
        1. 在 appauto 仓库执行 git fetch
        2. 检出指定分支 git checkout <branch>
        3. 拉取最新代码 git pull
        4. 重新创建/更新对应的 venv
        5. 在 venv 中重新安装 appauto

        Args:
            branch: 分支名

        Returns:
            ExecutionResult: 执行结果
        """
        summary = {
            "branch": branch,
            "appauto_path": str(self.appauto_path),
            "steps": []
        }

        # 检查 appauto 路径是否存在
        if not self.appauto_path.exists():
            error_msg = f"appauto 路径不存在: {self.appauto_path}"
            self.log_error(error_msg)
            return ExecutionResult(
                success=False,
                summary=summary,
                error=error_msg
            )

        # 步骤 1: git fetch
        self.log_info("步骤 1/5: 执行 git fetch")
        success, stdout, stderr = await self._run_command(
            ["git", "fetch"],
            cwd=self.appauto_path
        )
        summary["steps"].append({
            "step": "git_fetch",
            "success": success,
            "stdout": stdout,
            "stderr": stderr
        })
        if not success:
            return ExecutionResult(
                success=False,
                summary=summary,
                error=f"git fetch 失败: {stderr}"
            )

        # 步骤 2: git checkout
        self.log_info(f"步骤 2/5: 检出分支 {branch}")
        success, stdout, stderr = await self._run_command(
            ["git", "checkout", branch],
            cwd=self.appauto_path
        )
        summary["steps"].append({
            "step": "git_checkout",
            "success": success,
            "stdout": stdout,
            "stderr": stderr
        })
        if not success:
            return ExecutionResult(
                success=False,
                summary=summary,
                error=f"git checkout 失败: {stderr}"
            )

        # 步骤 3: git pull
        self.log_info("步骤 3/5: 拉取最新代码")
        success, stdout, stderr = await self._run_command(
            ["git", "pull"],
            cwd=self.appauto_path
        )
        summary["steps"].append({
            "step": "git_pull",
            "success": success,
            "stdout": stdout,
            "stderr": stderr
        })
        if not success:
            return ExecutionResult(
                success=False,
                summary=summary,
                error=f"git pull 失败: {stderr}"
            )

        # 获取当前 commit hash
        success, commit_hash, _ = await self._run_command(
            ["git", "rev-parse", "HEAD"],
            cwd=self.appauto_path
        )
        if success:
            summary["commit_hash"] = commit_hash.strip()

        # 步骤 4: 重新创建 venv
        venv_path = self.venv_base_path / f"appauto-{branch}" / ".venv"
        self.log_info(f"步骤 4/5: 重新创建虚拟环境 {venv_path}")

        # 删除旧的 venv（如果存在）
        if venv_path.exists():
            self.log_info(f"删除旧的虚拟环境: {venv_path}")
            success, stdout, stderr = await self._run_command(
                ["rm", "-rf", str(venv_path)]
            )
            if not success:
                self.log_error(f"删除旧虚拟环境失败: {stderr}")

        # 确保父目录存在
        venv_path.parent.mkdir(parents=True, exist_ok=True)

        # 创建新的 venv
        success, stdout, stderr = await self._run_command(
            ["python3", "-m", "venv", str(venv_path)]
        )
        summary["steps"].append({
            "step": "create_venv",
            "success": success,
            "venv_path": str(venv_path),
            "stdout": stdout,
            "stderr": stderr
        })
        if not success:
            return ExecutionResult(
                success=False,
                summary=summary,
                error=f"创建虚拟环境失败: {stderr}"
            )

        # 步骤 5: 在 venv 中安装 appauto
        self.log_info("步骤 5/5: 安装 appauto 依赖")
        pip_path = venv_path / "bin" / "pip"

        # 先安装 uv（加速依赖安装），使用较长超时时间（10分钟）
        success, stdout, stderr = await self._run_command(
            [str(pip_path), "install", "uv"],
            timeout=600
        )
        if not success:
            self.log_error(f"安装 uv 失败: {stderr}")

        # 使用 uv 安装 appauto，使用更长超时时间（20分钟）
        uv_path = venv_path / "bin" / "uv"
        if uv_path.exists():
            install_cmd = [str(uv_path), "pip", "install", "-e", str(self.appauto_path)]
        else:
            install_cmd = [str(pip_path), "install", "-e", str(self.appauto_path)]

        success, stdout, stderr = await self._run_command(install_cmd, timeout=1200)
        summary["steps"].append({
            "step": "install_appauto",
            "success": success,
            "stdout": stdout,
            "stderr": stderr
        })
        if not success:
            return ExecutionResult(
                success=False,
                summary=summary,
                error=f"安装 appauto 失败: {stderr}"
            )

        # 获取安装的 appauto 版本
        appauto_bin = venv_path / "bin" / "appauto"
        if appauto_bin.exists():
            success, version_output, _ = await self._run_command(
                [str(appauto_bin), "--version"]
            )
            if success:
                summary["appauto_version"] = version_output.strip()

        summary["venv_path"] = str(venv_path)
        summary["completed_at"] = datetime.now().isoformat()

        self.log_info(f"系统维护完成: 分支 {branch}, venv: {venv_path}")

        return ExecutionResult(
            success=True,
            summary=summary
        )

    async def _run_command(
        self,
        cmd: list,
        cwd: Path = None,
        timeout: int = 300
    ) -> tuple[bool, str, str]:
        """运行命令并返回结果

        Args:
            cmd: 命令列表
            cwd: 工作目录
            timeout: 超时时间（秒）

        Returns:
            tuple[bool, str, str]: (成功标志, stdout, stderr)
        """
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd
            )

            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )

            success = process.returncode == 0
            stdout_str = stdout.decode("utf-8", errors="replace")
            stderr_str = stderr.decode("utf-8", errors="replace")

            return success, stdout_str, stderr_str

        except asyncio.TimeoutError:
            self.log_error(f"命令执行超时: {' '.join(cmd)}")
            return False, "", "命令执行超时"
        except Exception as e:
            self.log_error(f"命令执行失败: {str(e)}")
            return False, "", str(e)
