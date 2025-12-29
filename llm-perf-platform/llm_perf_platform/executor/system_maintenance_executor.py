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
        # APPAUTO_PATH 环境变量检查（为了向后兼容保留，但新实现不再使用）
        # 系统维护现在使用 VenvManager 来管理独立的 appauto 仓库
        appauto_path_str = os.getenv("APPAUTO_PATH")
        if appauto_path_str:
            self.log_info(f"检测到 APPAUTO_PATH 环境变量: {appauto_path_str}，但新实现使用独立仓库管理")
            self.legacy_appauto_path = Path(appauto_path_str)
        else:
            self.legacy_appauto_path = None

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

        使用 VenvManager 管理独立的 appauto 仓库，每个分支拥有独立的代码和 venv。

        步骤：
        1. 检查仓库是否存在
        2. 如果存在，尝试更新（git pull）
        3. 如果不存在或更新失败，删除并重新创建
        4. 获取版本信息

        Args:
            branch: 分支名

        Returns:
            ExecutionResult: 执行结果
        """
        from llm_perf_platform.services.venv_manager import get_venv_manager

        summary = {
            "branch": branch,
            "steps": []
        }

        # 获取 VenvManager 实例
        venv_manager = get_venv_manager()
        repo_path = venv_manager.get_repo_path(branch)

        self.log_info(f"使用 VenvManager 管理 appauto 分支: {branch}")
        self.log_info(f"仓库路径: {repo_path}")

        # 步骤 1: 检查仓库是否存在
        repo_exists = venv_manager.repo_exists(branch)
        summary["steps"].append({
            "step": "check_repo_exists",
            "success": True,
            "repo_exists": repo_exists,
            "repo_path": str(repo_path)
        })

        needs_recreate = False

        if repo_exists:
            self.log_info(f"步骤 2/4: 仓库已存在，尝试更新")

            # 尝试 git fetch
            success, stdout, stderr = await self._run_command(
                ["git", "fetch"],
                cwd=repo_path
            )
            summary["steps"].append({
                "step": "git_fetch",
                "success": success,
                "stdout": stdout,
                "stderr": stderr
            })

            if not success:
                self.log_warning(f"git fetch 失败: {stderr}，将重新创建仓库")
                needs_recreate = True
            else:
                # 尝试 git pull
                success, stdout, stderr = await self._run_command(
                    ["git", "pull"],
                    cwd=repo_path
                )
                summary["steps"].append({
                    "step": "git_pull",
                    "success": success,
                    "stdout": stdout,
                    "stderr": stderr
                })

                if not success:
                    self.log_warning(f"git pull 失败: {stderr}，将重新创建仓库")
                    needs_recreate = True
                else:
                    self.log_info("成功更新代码")
        else:
            self.log_info(f"步骤 2/4: 仓库不存在")
            needs_recreate = True

        # 步骤 3: 如果需要，重新创建仓库
        if needs_recreate:
            self.log_info(f"步骤 3/4: 删除旧仓库并重新创建")

            # 删除旧仓库
            if repo_path.exists():
                venv_manager.remove_repo(branch)
                summary["steps"].append({
                    "step": "remove_old_repo",
                    "success": True
                })

            # 创建新仓库（VenvManager.create_repo 会自动克隆代码、创建venv、安装依赖）
            self.log_info(f"创建新的独立仓库（包含代码克隆、venv创建、依赖安装）")
            create_success = venv_manager.create_repo(branch)

            summary["steps"].append({
                "step": "create_repo",
                "success": create_success
            })

            if not create_success:
                error_msg = f"创建仓库失败: {branch}"
                self.log_error(error_msg)
                return ExecutionResult(
                    success=False,
                    summary=summary,
                    error=error_msg
                )

            self.log_info(f"成功创建独立仓库和虚拟环境")

        # 步骤 4: 获取版本信息
        self.log_info(f"步骤 4/4: 获取版本信息")

        # 获取 commit hash
        success, commit_hash, _ = await self._run_command(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_path
        )
        if success:
            summary["commit_hash"] = commit_hash.strip()

        # 获取 appauto 版本
        appauto_bin = venv_manager.get_appauto_bin_path(branch)
        if appauto_bin.exists():
            success, version_output, _ = await self._run_command(
                [str(appauto_bin), "--version"]
            )
            if success:
                summary["appauto_version"] = version_output.strip()
                self.log_info(f"Appauto 版本: {summary['appauto_version']}")

        summary["repo_path"] = str(repo_path)
        summary["venv_path"] = str(repo_path / ".venv")
        summary["appauto_bin"] = str(appauto_bin)
        summary["completed_at"] = datetime.now().isoformat()

        self.log_info(f"系统维护完成: 分支 {branch}")
        self.log_info(f"  仓库路径: {repo_path}")
        self.log_info(f"  Venv 路径: {repo_path / '.venv'}")
        self.log_info(f"  Appauto 可执行文件: {appauto_bin}")

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
