"""模型生命周期管理器 - 基于 appauto 的模型启动和停止

重要说明：
    本平台是 appauto 的 Web UI 封装，所有模型管理功能均调用 appauto 的能力。
    不应该重复实现模型启动逻辑，而是作为 appauto 的上层封装。

支持两种测试场景：
    1. AMaaS 测试：通过 AMaaS API 启动模型
    2. FT 容器测试：在 zhiwen-ft 容器内启动模型
"""
import logging
from llm_perf_platform.utils.logging_config import get_logger
from typing import Optional, Dict, Any
from datetime import datetime

from sqlmodel import Session, select

from llm_perf_platform.models.db import get_session
from llm_perf_platform.models.model_instance import ModelInstance, ModelStatus

# appauto 导入
try:
    from appauto.operator.amaas_node import AMaaSNode
    from appauto.operator.amaas_node.cli import AMaaSNodeCli
    from appauto.operator.amaas_node.cli.components.ft_ctn import FTContainer
    from appauto.organizer.model_params.constructor.base_model_config import BaseModelConfig
    APPAUTO_AVAILABLE = True
except ImportError as e:
    logging.warning(f"appauto not available: {e}")
    APPAUTO_AVAILABLE = False
    AMaaSNode = None
    AMaaSNodeCli = None
    FTContainer = None
    BaseModelConfig = None


logger = get_logger(__name__)


class ModelLifecycleManager:
    """模型生命周期管理器

    基于 appauto 实现的模型生命周期管理，支持：
    - AMaaS 场景：调用 AMaaS API 启动模型
    - FT 场景：在 ft 容器内启动模型
    """

    def __init__(self, db_session: Optional[Session] = None):
        """初始化管理器

        Args:
            db_session: 数据库会话，如果不提供则自动创建
        """
        if not APPAUTO_AVAILABLE:
            raise RuntimeError("appauto is not available, please install it first")

        self.db_session = db_session or get_session()

    async def launch_model(
        self,
        model_name: str,
        engine: str,
        tp: int,
        mode: str = "correct",
        scenario: str = "amaas",
        model_path: Optional[str] = None,
        host: str = "0.0.0.0",
        port: int = 30000,
        ssh_config: Optional[Dict[str, Any]] = None,
        created_by: Optional[str] = None,
        **kwargs
    ) -> ModelInstance:
        """启动模型实例

        根据 scenario 参数选择不同的启动方式：
        - amaas: 通过 AMaaS API 启动（调用 appauto 的 AMaaSNode）
        - ft: 在 ft 容器内启动（调用 appauto 的 FTContainer）

        Args:
            model_name: 模型名称
            engine: 引擎（vllm/sglang/ftransformers）
            tp: Tensor Parallelism并行度
            mode: 运行模式（correct/perf）
            scenario: 测试场景（amaas/ft）
            model_path: 自定义模型路径（完整路径）
            host: 监听地址
            port: 监听端口
            ssh_config: SSH配置（必须提供）
            created_by: 创建者用户名
            **kwargs: 其他参数（amaas_api_port, amaas_api_user等）

        Returns:
            创建的ModelInstance对象

        Raises:
            ValueError: 配置无效时抛出
            RuntimeError: 启动失败时抛出
        """
        logger.info(f"Launching model: {model_name}, scenario: {scenario}, engine: {engine}, tp: {tp}, mode: {mode}")

        # 验证必要参数
        if not ssh_config:
            raise ValueError("ssh_config is required for model launch")

        # 获取模型元信息
        try:
            class TempModelConfig(BaseModelConfig):
                def __init__(self, name):
                    self.model_name = name

            config = TempModelConfig(model_name)
            model_family = config.model_family
            model_type = config.model_type
        except Exception as e:
            logger.warning(f"Failed to get model info from BaseModelConfig: {e}")
            model_family = "unknown"
            model_type = "llm"

        # 确定模型路径
        if not model_path:
            base_model_dir = kwargs.get("base_model_dir", "/mnt/data/models")
            model_path = f"{base_model_dir}/{model_name}"

        # 创建数据库记录
        instance = ModelInstance(
            model_name=model_name,
            model_family=model_family,
            model_type=model_type,
            engine=engine,
            tp=tp,
            mode=mode,
            scenario=scenario,
            model_path=model_path,
            host=host,
            port=port,
            ssh_config=ssh_config,
            status=ModelStatus.PENDING,
            created_by=created_by,
        )

        self.db_session.add(instance)
        self.db_session.commit()
        self.db_session.refresh(instance)

        # 根据场景选择启动方式
        try:
            if scenario == "amaas":
                await self._launch_via_amaas(instance, ssh_config, kwargs)
            elif scenario == "ft":
                await self._launch_via_ft(instance, ssh_config, kwargs)
            else:
                raise ValueError(f"Unsupported scenario: {scenario}")

            return instance

        except Exception as e:
            logger.error(f"Failed to launch model: {e}")
            # 更新状态为错误
            instance.status = ModelStatus.ERROR
            instance.error_message = str(e)
            instance.updated_at = datetime.now()
            self.db_session.commit()
            raise RuntimeError(f"Model launch failed: {e}")

    async def _launch_via_amaas(
        self,
        instance: ModelInstance,
        ssh_config: Dict[str, Any],
        extra_params: Dict[str, Any]
    ) -> None:
        """通过 AMaaS API 启动模型

        调用 appauto 的 AMaaSNode 来启动模型

        Args:
            instance: 模型实例对象
            ssh_config: SSH配置
            extra_params: 额外参数（包含 AMaaS API 配置）
        """
        logger.info(f"Launching model via AMaaS: {instance.model_name}")

        try:
            # 更新状态为加载中
            instance.status = ModelStatus.LOADING
            instance.updated_at = datetime.now()
            self.db_session.commit()

            # 初始化 AMaaSNode
            amaas_node = AMaaSNode(
                mgt_ip=ssh_config["host"],
                ssh_user=ssh_config["user"],
                ssh_password=ssh_config.get("password"),
                ssh_port=ssh_config.get("port", 22),
                api_port=extra_params.get("amaas_api_port", 10001),
                api_user=extra_params.get("amaas_api_user", "admin"),
                api_passwd=extra_params.get("amaas_api_passwd", "123456"),
            )

            # 从 model store 中查找模型
            # 根据 model_type 选择对应的 store
            type_to_store = {
                "llm": "llm",
                "vlm": "vlm",
                "embedding": "embedding",
                "rerank": "rerank",
                "audio": "audio",
                "parser": "parser",
            }

            store_type = type_to_store.get(instance.model_type, "llm")
            model_stores = amaas_node.api.get_models_store(store_type)

            # 查找匹配的 model_store
            model_store = None
            for ms in model_stores:
                if ms.name == instance.model_name:
                    model_store = ms
                    break

            if not model_store:
                raise ValueError(
                    f"Model {instance.model_name} not found in AMaaS {store_type} store. "
                    f"Available models: {[ms.name for ms in model_stores]}"
                )

            # 启动模型
            if instance.mode == "correct":
                logger.info(f"Launching model with default params (correct mode)")
                amaas_node.api.launch_model_with_default(
                    tp=instance.tp,
                    model_store=model_store,
                    timeout_s=900
                )
            else:  # perf mode
                logger.info(f"Launching model with perf params")
                amaas_node.api.launch_model_with_perf(
                    tp=instance.tp,
                    model_store=model_store,
                    timeout_s=900
                )

            # 构建 endpoint
            remote_host = ssh_config["host"]
            instance.endpoint = f"http://{remote_host}:{instance.port}/v1"
            instance.status = ModelStatus.RUNNING
            instance.started_at = datetime.now()
            instance.updated_at = datetime.now()
            instance.launch_command = f"AMaaS API launch (mode={instance.mode}, tp={instance.tp})"

            self.db_session.commit()
            logger.info(f"Model launched successfully via AMaaS")

        except Exception as e:
            logger.error(f"AMaaS launch failed: {e}")
            instance.status = ModelStatus.ERROR
            instance.error_message = str(e)
            instance.updated_at = datetime.now()
            self.db_session.commit()
            raise

    async def _launch_via_ft(
        self,
        instance: ModelInstance,
        ssh_config: Dict[str, Any],
        extra_params: Dict[str, Any]
    ) -> None:
        """在 FT 容器内启动模型

        调用 appauto 的 FTContainer 来启动模型

        Args:
            instance: 模型实例对象
            ssh_config: SSH配置
            extra_params: 额外参数（包含 FT 容器配置）
        """
        logger.info(f"Launching model via FT container: {instance.model_name}")

        try:
            # 更新状态为加载中
            instance.status = ModelStatus.LOADING
            instance.updated_at = datetime.now()
            self.db_session.commit()

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
                name=extra_params.get("ft_container_name", "zhiwen-ft"),
                conda_env=extra_params.get("ft_conda_env", "ftransformers"),
                engine=instance.engine,
            )

            # 启动模型
            logger.info(f"Launching model in FT container")
            ft_container.launch_model(
                model_name=instance.model_name,
                tp=instance.tp,
                mode=instance.mode,
                port=instance.port,
                wait_for_running=True,
                interval_s=20,
                timeout_s=900,
                ip=ssh_config["host"],
            )

            # 构建 endpoint
            remote_host = ssh_config["host"]
            instance.endpoint = f"http://{remote_host}:{instance.port}/v1"
            instance.status = ModelStatus.RUNNING
            instance.started_at = datetime.now()
            instance.updated_at = datetime.now()
            instance.launch_command = f"FT container launch (mode={instance.mode}, tp={instance.tp})"

            self.db_session.commit()
            logger.info(f"Model launched successfully via FT container")

        except Exception as e:
            logger.error(f"FT container launch failed: {e}")
            instance.status = ModelStatus.ERROR
            instance.error_message = str(e)
            instance.updated_at = datetime.now()
            self.db_session.commit()
            raise

    async def stop_model(self, instance_id: int) -> bool:
        """停止模型实例

        Args:
            instance_id: 模型实例ID

        Returns:
            True if stopped successfully, False otherwise
        """
        logger.info(f"Stopping model instance: {instance_id}")

        # 查询实例
        instance = self.db_session.get(ModelInstance, instance_id)
        if not instance:
            logger.warning(f"Model instance {instance_id} not found")
            return False

        if instance.is_stopped:
            logger.info(f"Model instance {instance_id} already stopped")
            return True

        try:
            if instance.scenario == "amaas":
                await self._stop_via_amaas(instance)
            elif instance.scenario == "ft":
                await self._stop_via_ft(instance)
            else:
                raise ValueError(f"Unsupported scenario: {instance.scenario}")

            # 更新状态
            instance.status = ModelStatus.STOPPED
            instance.stopped_at = datetime.now()
            instance.updated_at = datetime.now()
            self.db_session.commit()

            logger.info(f"Model instance {instance_id} stopped successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to stop model instance {instance_id}: {e}")
            instance.error_message = f"Stop failed: {e}"
            instance.updated_at = datetime.now()
            self.db_session.commit()
            return False

    async def _stop_via_amaas(self, instance: ModelInstance) -> None:
        """通过 AMaaS API 停止模型

        Args:
            instance: 模型实例对象
        """
        logger.info(f"Stopping model via AMaaS: {instance.model_name}")

        try:
            # 初始化 AMaaSNode
            amaas_node = AMaaSNode(
                mgt_ip=instance.ssh_config["host"],
                ssh_user=instance.ssh_config["user"],
                ssh_password=instance.ssh_config.get("password"),
                ssh_port=instance.ssh_config.get("port", 22),
                api_port=10001,
                api_user="admin",
                api_passwd="123456",
            )

            # 查找并停止模型
            type_to_store = {
                "llm": "llm",
                "vlm": "vlm",
                "embedding": "embedding",
                "rerank": "rerank",
                "audio": "audio",
                "parser": "parser",
            }

            store_type = type_to_store.get(instance.model_type, "llm")
            model_stores = amaas_node.api.get_models_store(store_type)

            model_store = None
            for ms in model_stores:
                if ms.name == instance.model_name:
                    model_store = ms
                    break

            if model_store:
                amaas_node.api.stop_model(model_store, store_type)
                logger.info(f"Model stopped via AMaaS API")
            else:
                logger.warning(f"Model {instance.model_name} not found in AMaaS, marking as stopped anyway")

        except Exception as e:
            logger.error(f"Failed to stop via AMaaS: {e}")
            raise

    async def _stop_via_ft(self, instance: ModelInstance) -> None:
        """通过 FT 容器停止模型

        Args:
            instance: 模型实例对象
        """
        logger.info(f"Stopping model via FT container: {instance.model_name}")

        try:
            # 初始化 AMaaSNodeCli
            cli = AMaaSNodeCli(
                mgt_ip=instance.ssh_config["host"],
                ssh_user=instance.ssh_config["user"],
                ssh_password=instance.ssh_config.get("password"),
                ssh_port=instance.ssh_config.get("port", 22),
            )

            # 初始化 FT 容器
            ft_container = FTContainer(
                node=cli,
                name="zhiwen-ft",
                engine=instance.engine,
            )

            # 停止模型
            ft_container.stop_model(instance.model_name)
            logger.info(f"Model stopped via FT container")

        except Exception as e:
            logger.error(f"Failed to stop via FT: {e}")
            raise

    def get_instance(self, instance_id: int) -> Optional[ModelInstance]:
        """获取模型实例

        Args:
            instance_id: 实例ID

        Returns:
            ModelInstance对象，如果不存在返回None
        """
        return self.db_session.get(ModelInstance, instance_id)

    def list_instances(
        self,
        status: Optional[str] = None,
        model_name: Optional[str] = None,
        engine: Optional[str] = None
    ) -> list[ModelInstance]:
        """列出模型实例

        Args:
            status: 过滤状态
            model_name: 过滤模型名称
            engine: 过滤引擎

        Returns:
            ModelInstance列表
        """
        statement = select(ModelInstance)

        if status:
            statement = statement.where(ModelInstance.status == status)
        if model_name:
            statement = statement.where(ModelInstance.model_name == model_name)
        if engine:
            statement = statement.where(ModelInstance.engine == engine)

        statement = statement.order_by(ModelInstance.created_at.desc())

        results = self.db_session.exec(statement)
        return list(results.all())

    async def check_health(self, instance_id: int) -> Dict[str, Any]:
        """检查模型实例健康状态

        Args:
            instance_id: 实例ID

        Returns:
            健康状态字典
        """
        instance = self.get_instance(instance_id)
        if not instance:
            return {"healthy": False, "error": "Instance not found"}

        if not instance.endpoint:
            return {"healthy": False, "error": "No endpoint configured"}

        try:
            import httpx

            # 尝试访问健康检查endpoint
            async with httpx.AsyncClient(timeout=5.0) as client:
                # 尝试访问 /health 或 /v1/models
                health_url = instance.endpoint.replace("/v1", "/health")
                try:
                    response = await client.get(health_url)
                    if response.status_code == 200:
                        # 更新实例状态
                        if instance.status == ModelStatus.LOADING:
                            instance.status = ModelStatus.RUNNING
                        instance.last_health_check = datetime.now()
                        instance.health_check_failures = 0
                        instance.updated_at = datetime.now()
                        self.db_session.commit()

                        return {"healthy": True, "endpoint": instance.endpoint}
                except httpx.HTTPError:
                    # 尝试 /v1/models
                    models_url = f"{instance.endpoint}/models"
                    response = await client.get(models_url)
                    if response.status_code == 200:
                        # 更新实例状态
                        if instance.status == ModelStatus.LOADING:
                            instance.status = ModelStatus.RUNNING
                        instance.last_health_check = datetime.now()
                        instance.health_check_failures = 0
                        instance.updated_at = datetime.now()
                        self.db_session.commit()

                        return {"healthy": True, "endpoint": instance.endpoint}

                # 健康检查失败
                instance.health_check_failures += 1
                instance.last_health_check = datetime.now()

                if instance.health_check_failures >= 3:
                    instance.status = ModelStatus.HEALTH_CHECK_FAILED

                instance.updated_at = datetime.now()
                self.db_session.commit()

                return {
                    "healthy": False,
                    "error": f"Health check failed (failures: {instance.health_check_failures})"
                }

        except Exception as e:
            logger.error(f"Health check failed for instance {instance_id}: {e}")
            instance.health_check_failures += 1
            instance.last_health_check = datetime.now()

            if instance.health_check_failures >= 3:
                instance.status = ModelStatus.HEALTH_CHECK_FAILED

            instance.updated_at = datetime.now()
            self.db_session.commit()

            return {"healthy": False, "error": str(e)}
