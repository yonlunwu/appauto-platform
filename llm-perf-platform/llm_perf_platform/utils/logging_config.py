"""
统一的日志配置模块

日志目录结构：
/logs/
├── platform/      # 平台应用日志
│   ├── app.log       # 应用主日志
│   ├── error.log     # 错误日志
│   └── access.log    # HTTP访问日志
├── tasks/         # 任务执行日志  
├── maintenance/   # 维护脚本日志
"""
import logging
import os
import sys
from logging.handlers import RotatingFileHandler, TimedRotatingFileHandler
from pathlib import Path
from typing import Optional

# 统一使用项目顶层的 logs 目录
DEFAULT_LOG_DIR = Path(__file__).resolve().parents[3] / "logs"
LOG_DIR = Path(os.getenv("LLM_PERF_LOG_DIR", DEFAULT_LOG_DIR))

# 子目录
PLATFORM_LOG_DIR = LOG_DIR / "platform"
TASKS_LOG_DIR = LOG_DIR / "tasks"
MAINTENANCE_LOG_DIR = LOG_DIR / "maintenance"

# 确保所有目录存在
for d in [PLATFORM_LOG_DIR, TASKS_LOG_DIR, MAINTENANCE_LOG_DIR]:
    d.mkdir(parents=True, exist_ok=True)

DETAILED_FORMAT = (
    "%(asctime)s | "
    "PID:%(process)d | "
    "Thread:%(thread)d(%(threadName)s) | "
    "%(levelname)-8s | "
    "%(name)s | "
    "[%(filename)s:%(lineno)d:%(funcName)s] | "
    "%(message)s"
)

SIMPLE_FORMAT = (
    "%(asctime)s | "
    "%(levelname)-8s | "
    "%(name)s | "
    "[%(filename)s:%(lineno)d] | "
    "%(message)s"
)

DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

def setup_logging(
    log_level: str = "INFO",
    log_dir: Optional[Path] = None,
    enable_console: bool = True,
    enable_file: bool = True,
) -> None:
    """配置应用程序的日志系统"""
    log_directory = log_dir or PLATFORM_LOG_DIR
    log_directory.mkdir(parents=True, exist_ok=True)
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    root_logger = logging.getLogger()
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    root_logger.setLevel(numeric_level)
    handlers = []
    if enable_console:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(numeric_level)
        console_formatter = logging.Formatter(SIMPLE_FORMAT, DATE_FORMAT)
        console_handler.setFormatter(console_formatter)
        handlers.append(console_handler)
    if enable_file:
        # 应用主日志
        app_handler = RotatingFileHandler(
            log_directory / "app.log",
            maxBytes=50 * 1024 * 1024,
            backupCount=10,
            encoding="utf-8",
        )
        app_handler.setLevel(numeric_level)
        app_formatter = logging.Formatter(DETAILED_FORMAT, DATE_FORMAT)
        app_handler.setFormatter(app_formatter)
        handlers.append(app_handler)
        # 错误日志
        error_handler = RotatingFileHandler(
            log_directory / "error.log",
            maxBytes=20 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        error_handler.setLevel(logging.ERROR)
        error_formatter = logging.Formatter(DETAILED_FORMAT, DATE_FORMAT)
        error_handler.setFormatter(error_formatter)
        handlers.append(error_handler)
    for handler in handlers:
        root_logger.addHandler(handler)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    logger = logging.getLogger(__name__)
    logger.info(f"Logging initialized: dir={log_directory}, level={log_level}")

def get_logger(name: str) -> logging.Logger:
    """获取指定名称的logger"""
    return logging.getLogger(name)

def setup_access_logging(log_dir: Optional[Path] = None) -> logging.Logger:
    """配置HTTP访问日志"""
    log_directory = log_dir or PLATFORM_LOG_DIR
    access_logger = logging.getLogger("llm_perf_platform.access")
    access_logger.setLevel(logging.INFO)
    access_logger.propagate = False
    access_handler = TimedRotatingFileHandler(
        log_directory / "access.log",
        when="midnight",
        interval=1,
        backupCount=30,
        encoding="utf-8",
    )
    access_formatter = logging.Formatter(DETAILED_FORMAT, DATE_FORMAT)
    access_handler.setFormatter(access_formatter)
    access_logger.addHandler(access_handler)
    return access_logger

__all__ = [
    "setup_logging",
    "get_logger",
    "setup_access_logging",
    "LOG_DIR",
    "PLATFORM_LOG_DIR",
    "TASKS_LOG_DIR",
    "MAINTENANCE_LOG_DIR",
]
