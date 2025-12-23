"""后台健康检查服务 - 定期检查模型实例健康状态"""
import asyncio
import logging
from llm_perf_platform.utils.logging_config import get_logger
from typing import Optional

from sqlmodel import select

from llm_perf_platform.models.db import get_session
from llm_perf_platform.models.model_instance import ModelInstance, ModelStatus
from llm_perf_platform.executor.model_lifecycle import ModelLifecycleManager


logger = get_logger(__name__)


class HealthCheckService:
    """健康检查服务

    后台服务，定期检查所有运行中的模型实例健康状态。
    """

    def __init__(
        self,
        check_interval: int = 60,  # 检查间隔（秒）
        startup_delay: int = 30,  # 启动延迟（秒）
    ):
        """初始化健康检查服务

        Args:
            check_interval: 检查间隔（秒），默认60秒
            startup_delay: 服务启动延迟（秒），默认30秒，等待应用完全启动
        """
        self.check_interval = check_interval
        self.startup_delay = startup_delay
        self._task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self):
        """启动健康检查服务"""
        if self._running:
            logger.warning("Health check service is already running")
            return

        logger.info(f"Starting health check service (interval: {self.check_interval}s)")
        self._running = True
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self):
        """停止健康检查服务"""
        if not self._running:
            return

        logger.info("Stopping health check service")
        self._running = False

        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run_loop(self):
        """运行健康检查循环"""
        try:
            # 等待应用启动
            if self.startup_delay > 0:
                logger.info(f"Waiting {self.startup_delay}s before starting health checks")
                await asyncio.sleep(self.startup_delay)

            logger.info("Health check service started")

            while self._running:
                try:
                    await self._check_all_instances()
                except Exception as e:
                    logger.error(f"Error in health check cycle: {e}", exc_info=True)

                # 等待下一次检查
                await asyncio.sleep(self.check_interval)

        except asyncio.CancelledError:
            logger.info("Health check service cancelled")
        except Exception as e:
            logger.error(f"Health check service error: {e}", exc_info=True)
        finally:
            self._running = False
            logger.info("Health check service stopped")

    async def _check_all_instances(self):
        """检查所有需要检查的实例"""
        db_session = get_session()

        try:
            # 查询所有需要检查的实例
            # - 状态为 LOADING 或 RUNNING 的实例
            statement = select(ModelInstance).where(
                ModelInstance.status.in_([
                    ModelStatus.LOADING,
                    ModelStatus.RUNNING,
                    ModelStatus.HEALTH_CHECK_FAILED
                ])
            )

            results = db_session.exec(statement)
            instances = list(results.all())

            if not instances:
                logger.debug("No instances to check")
                return

            logger.info(f"Checking health for {len(instances)} instances")

            # 并发检查所有实例
            manager = ModelLifecycleManager(db_session)

            tasks = [
                manager.check_health(instance.id)
                for instance in instances
            ]

            results = await asyncio.gather(*tasks, return_exceptions=True)

            # 统计结果
            healthy_count = 0
            unhealthy_count = 0
            error_count = 0

            for i, result in enumerate(results):
                instance = instances[i]

                if isinstance(result, Exception):
                    logger.error(f"Health check error for instance {instance.id}: {result}")
                    error_count += 1
                elif result.get("healthy"):
                    healthy_count += 1
                    logger.debug(f"Instance {instance.id} ({instance.model_name}) is healthy")
                else:
                    unhealthy_count += 1
                    logger.warning(
                        f"Instance {instance.id} ({instance.model_name}) is unhealthy: "
                        f"{result.get('error', 'Unknown error')}"
                    )

            logger.info(
                f"Health check completed: {healthy_count} healthy, "
                f"{unhealthy_count} unhealthy, {error_count} errors"
            )

        except Exception as e:
            logger.error(f"Failed to check instances: {e}", exc_info=True)
        finally:
            db_session.close()


# 全局健康检查服务实例
_health_check_service: Optional[HealthCheckService] = None


def get_health_check_service(
    check_interval: int = 60,
    startup_delay: int = 30
) -> HealthCheckService:
    """获取全局健康检查服务实例

    Args:
        check_interval: 检查间隔（秒）
        startup_delay: 启动延迟（秒）

    Returns:
        HealthCheckService实例
    """
    global _health_check_service
    if _health_check_service is None:
        _health_check_service = HealthCheckService(
            check_interval=check_interval,
            startup_delay=startup_delay
        )
    return _health_check_service


async def start_health_check_service(
    check_interval: int = 60,
    startup_delay: int = 30
):
    """启动健康检查服务（便捷函数）

    Args:
        check_interval: 检查间隔（秒）
        startup_delay: 启动延迟（秒）
    """
    service = get_health_check_service(check_interval, startup_delay)
    await service.start()


async def stop_health_check_service():
    """停止健康检查服务（便捷函数）"""
    if _health_check_service:
        await _health_check_service.stop()
