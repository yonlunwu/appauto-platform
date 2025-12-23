"""远程模型扫描器 - 扫描远程服务器上的可用模型"""
import logging
from llm_perf_platform.utils.logging_config import get_logger
from typing import List, Dict, Optional
from pathlib import Path
import os
from pydantic import BaseModel

from llm_perf_platform.executor.ssh_client import SSHClient

# 使用 appauto 的模型配置
try:
    from appauto.organizer.model_params.constructor.base_model_config import BaseModelConfig
    APPAUTO_AVAILABLE = True
except ImportError:
    APPAUTO_AVAILABLE = False
    BaseModelConfig = None


logger = get_logger(__name__)


# ========== 数据类定义 ==========

class ModelScanResult(BaseModel):
    """模型扫描结果数据类

    Attributes:
        name: 模型目录名
        path: 模型完整路径
        size_gb: 目录大小(GB)
        family: 模型家族（如 qwen、deepseek）
        model_type: 模型类型（llm、embedding、rerank 等）
    """
    name: str
    path: str
    size_gb: Optional[float] = None
    family: Optional[str] = None
    model_type: Optional[str] = None


class ModelValidationResult(BaseModel):
    """模型路径验证结果数据类

    Attributes:
        exists: 路径是否存在
        is_directory: 是否为目录
        size_gb: 目录大小(GB)
        has_config: 是否包含 config.json
        has_tokenizer: 是否包含 tokenizer 文件
    """
    exists: bool
    is_directory: bool
    size_gb: Optional[float] = None
    has_config: bool
    has_tokenizer: bool


class ModelScanner:
    """模型扫描器

    用于扫描远程服务器上的可用模型目录
    支持SSH连接到远程服务器，列出指定目录下的模型
    """

    def __init__(self, ssh_config: Dict):
        """初始化扫描器

        Args:
            ssh_config: SSH配置字典
                {
                    "host": "192.168.1.100",
                    "port": 22,
                    "user": "username",
                    "auth_type": "key",  # or "password"
                    "password": "xxx",  # optional
                    "private_key_path": "~/.ssh/id_rsa",  # optional
                    "passphrase": "xxx",  # optional
                    "timeout": 30  # optional
                }
        """
        self.ssh_config = ssh_config
        self.ssh_client = SSHClient(ssh_config)

    async def scan_models(
        self,
        base_dir: str = "/mnt/data/models",
        include_hidden: bool = False
    ) -> List[ModelScanResult]:
        """扫描指定目录下的模型

        直接列出目录下的所有模型目录，不做配置文件匹配。
        只展示目录（不展示文件），排除 AMES/perftest/output 等非模型目录。
        后续会引入 appauto 依赖来处理模型配置匹配。

        Args:
            base_dir: 基础目录路径 (默认: /mnt/data/models)
            include_hidden: 是否包含隐藏目录 (以.开头的目录)

        Returns:
            模型扫描结果列表 (ModelScanResult)
        """
        logger.info(f"Scanning models in {base_dir} on {self.ssh_config['host']}")

        try:
            async with self.ssh_client:
                # 检查目录是否存在
                check_cmd = f"test -d '{base_dir}' && echo 'exists' || echo 'not_found'"
                stdout, stderr, returncode = await self.ssh_client.execute(check_cmd)

                if stdout.strip() != "exists":
                    logger.warning(f"Directory {base_dir} does not exist on remote server")
                    return []

                # 获取目录列表（只包含目录，不包含文件）
                # 使用 ls -d */ 只列出目录
                # 排除非模型目录：AMES、perftest、output、log 等（子串匹配）
                exclude_pattern = "AMES|perftest|output|log"
                if not include_hidden:
                    exclude_pattern += "|^\\."  # 排除以点号开头的隐藏目录

                ls_cmd = f"cd '{base_dir}' && ls -d */ 2>/dev/null | sed 's|/$||' | egrep -v '{exclude_pattern}'"

                stdout, stderr, returncode = await self.ssh_client.execute(ls_cmd)

                # egrep -v 如果没有匹配项会返回非0，这是正常的
                if returncode != 0 and not stdout.strip():
                    logger.info(f"No model directories found in {base_dir} after filtering")
                    return []

                # 解析目录列表
                dir_names = [line.strip() for line in stdout.split("\n") if line.strip()]

                if not dir_names:
                    logger.info(f"No directories found in {base_dir}")
                    return []

                logger.info(f"Found {len(dir_names)} model directories")
                logger.info(f"Directories: {dir_names}")

                # 构建模型信息列表
                models = []
                for dir_name in dir_names:
                    model_path = f"{base_dir}/{dir_name}"

                    # 获取目录大小 (以GB为单位)
                    size_gb = await self._get_directory_size_gb(model_path)

                    # 获取模型family和type（如果appauto可用）
                    family, model_type = self._get_model_info(dir_name)

                    # 使用 ModelScanResult 数据类
                    models.append(ModelScanResult(
                        name=dir_name,
                        path=model_path,
                        size_gb=size_gb,
                        family=family,
                        model_type=model_type,
                    ))

                logger.info(f"Successfully scanned {len(models)} models")
                return models

        except Exception as e:
            logger.error(f"Failed to scan models: {e}")
            raise

    def _get_model_info(self, model_name: str) -> tuple[Optional[str], Optional[str]]:
        """获取模型的 family 和 type 信息

        使用 appauto 的 BaseModelConfig 来获取模型信息。
        如果 appauto 不可用或模型不在配置中，返回 None。

        Args:
            model_name: 模型名称

        Returns:
            (family, model_type) 元组
        """
        if not APPAUTO_AVAILABLE:
            logger.debug("appauto not available, skipping model info lookup")
            return None, None

        try:
            # 创建一个临时的配置对象来获取模型信息
            class TempModelConfig(BaseModelConfig):
                def __init__(self, name):
                    self.model_name = name

            config = TempModelConfig(model_name)
            return config.model_family, config.model_type
        except Exception as e:
            logger.debug(f"Failed to get model info for {model_name}: {e}")
            return None, None

    async def _get_directory_size_gb(self, directory: str) -> Optional[float]:
        """获取目录大小（GB）

        Args:
            directory: 目录路径

        Returns:
            目录大小（GB），如果获取失败返回None
        """
        try:
            # 使用 du 命令获取目录大小
            # -s: 只显示总计
            # -b: 以字节为单位
            cmd = f"du -sb '{directory}' 2>/dev/null | cut -f1"
            stdout, stderr, returncode = await self.ssh_client.execute(cmd, timeout=60)

            if returncode == 0 and stdout:
                bytes_size = int(stdout.strip())
                gb_size = bytes_size / (1024 ** 3)  # 转换为GB
                return round(gb_size, 2)
            else:
                return None
        except Exception as e:
            logger.warning(f"Failed to get directory size for {directory}: {e}")
            return None

    async def check_model_exists(self, model_path: str) -> bool:
        """检查指定模型路径是否存在

        Args:
            model_path: 模型完整路径

        Returns:
            True if exists, False otherwise
        """
        try:
            async with self.ssh_client:
                cmd = f"test -d '{model_path}' && echo 'exists' || echo 'not_found'"
                stdout, stderr, returncode = await self.ssh_client.execute(cmd)
                return stdout.strip() == "exists"
        except Exception as e:
            logger.error(f"Failed to check model existence: {e}")
            return False

    async def validate_model_path(self, model_path: str) -> ModelValidationResult:
        """验证模型路径并获取详细信息

        Args:
            model_path: 模型完整路径

        Returns:
            模型验证结果 (ModelValidationResult)
        """
        logger.info(f"Validating model path: {model_path}")

        try:
            async with self.ssh_client:
                # 检查是否存在且是目录
                check_cmd = f"test -d '{model_path}' && echo 'dir' || (test -e '{model_path}' && echo 'file' || echo 'not_found')"
                stdout, stderr, returncode = await self.ssh_client.execute(check_cmd)

                status = stdout.strip()
                if status == "not_found":
                    return ModelValidationResult(
                        exists=False,
                        is_directory=False,
                        size_gb=None,
                        has_config=False,
                        has_tokenizer=False,
                    )

                exists = True
                is_directory = (status == "dir")

                if not is_directory:
                    logger.warning(f"Path {model_path} exists but is not a directory")
                    return ModelValidationResult(
                        exists=exists,
                        is_directory=is_directory,
                        size_gb=None,
                        has_config=False,
                        has_tokenizer=False,
                    )

                # 获取目录大小
                size_gb = await self._get_directory_size_gb(model_path)

                # 检查关键文件
                # config.json
                config_cmd = f"test -f '{model_path}/config.json' && echo 'exists' || echo 'not_found'"
                stdout, _, _ = await self.ssh_client.execute(config_cmd)
                has_config = (stdout.strip() == "exists")

                # tokenizer相关文件 (tokenizer.json 或 tokenizer_config.json)
                tokenizer_cmd = f"test -f '{model_path}/tokenizer.json' -o -f '{model_path}/tokenizer_config.json' && echo 'exists' || echo 'not_found'"
                stdout, _, _ = await self.ssh_client.execute(tokenizer_cmd)
                has_tokenizer = (stdout.strip() == "exists")

                return ModelValidationResult(
                    exists=exists,
                    is_directory=is_directory,
                    size_gb=size_gb,
                    has_config=has_config,
                    has_tokenizer=has_tokenizer,
                )

        except Exception as e:
            logger.error(f"Failed to validate model path: {e}")
            raise


async def scan_remote_models(
    ssh_config: Dict,
    base_dir: str = "/mnt/data/models",
    include_hidden: bool = False
) -> List[ModelScanResult]:
    """便捷函数：扫描远程服务器上的模型

    Args:
        ssh_config: SSH配置字典
        base_dir: 基础目录路径
        include_hidden: 是否包含隐藏目录

    Returns:
        模型扫描结果列表 (ModelScanResult)
    """
    scanner = ModelScanner(ssh_config)
    return await scanner.scan_models(base_dir, include_hidden)


async def validate_remote_model(
    ssh_config: Dict,
    model_path: str
) -> ModelValidationResult:
    """便捷函数：验证远程模型路径

    Args:
        ssh_config: SSH配置字典
        model_path: 模型完整路径

    Returns:
        模型验证结果 (ModelValidationResult)
    """
    scanner = ModelScanner(ssh_config)
    return await scanner.validate_model_path(model_path)
