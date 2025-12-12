import asyncio
import logging
import os
from pathlib import Path
from logging.handlers import RotatingFileHandler

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

# Configure logging
# 创建日志目录
LOG_DIR = Path(os.getenv("LLM_PERF_LOG_DIR", Path(__file__).resolve().parents[2] / "logs"))
LOG_DIR.mkdir(parents=True, exist_ok=True)

# 配置日志格式
log_format = '%(asctime)s | %(levelname)-8s | %(name)s | %(message)s'
date_format = '%Y-%m-%d %H:%M:%S'

# 配置根日志记录器
logging.basicConfig(
    level=logging.INFO,
    format=log_format,
    datefmt=date_format,
    force=True,  # Force reconfiguration even if logging is already configured
    handlers=[
        # 控制台输出
        logging.StreamHandler(),
        # 文件输出（自动轮转，最多保留 10 个文件，每个最大 10MB）
        RotatingFileHandler(
            LOG_DIR / "llm_perf_platform.log",
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=10,
            encoding="utf-8",
        ),
    ],
)

logger = logging.getLogger(__name__)


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
