import asyncio
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from llm_perf_platform.api.router import router as api_router
from llm_perf_platform.models.db import init_db
from llm_perf_platform.tasks.scheduler import task_scheduler
from llm_perf_platform.services.health_checker import (
    start_health_check_service,
    stop_health_check_service,
)
from llm_perf_platform.middleware import RequestLoggingMiddleware

# Configure logging using centralized config
from llm_perf_platform.utils.logging_config import setup_logging, get_logger, LOG_DIR

# Initialize logging system
setup_logging(log_level="INFO")
logger = get_logger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(title="LLM Performance Test Platform")

    # 添加请求日志中间件（在 CORS 之前）
    app.add_middleware(RequestLoggingMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    logger.info(f"Log directory: {LOG_DIR}")
    logger.info("Application initialized with request logging enabled")

    @app.on_event("startup")
    async def on_startup():
        """Initialize persistent resources when the API boots."""
        init_db()

        # 确保存在默认管理员账号
        from llm_perf_platform.services.auth_service import AuthService
        auth_service = AuthService()
        auth_service.ensure_default_admin()

        task_scheduler.start()
        # 启动健康检查服务 (60秒间隔, 30秒启动延迟)
        await start_health_check_service(check_interval=60, startup_delay=30)

    @app.on_event("shutdown")
    async def on_shutdown():
        """Release background workers when the API stops."""
        task_scheduler.shutdown()
        # 停止健康检查服务
        await stop_health_check_service()

    app.include_router(api_router, prefix="/api")

    @app.get("/")
    def root():
        return {"status": "ok", "message": "LLM Perf Platform is running"}

    return app


app = create_app()
