"""
统一的日志配置模块
"""
import logging
import os
import sys
from logging.handlers import RotatingFileHandler, TimedRotatingFileHandler
from pathlib import Path
from typing import Optional

DEFAULT_LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
LOG_DIR = Path(os.getenv("LLM_PERF_LOG_DIR", DEFAULT_LOG_DIR))
LOG_DIR.mkdir(parents=True, exist_ok=True)

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
    log_directory = log_dir or LOG_DIR
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
        app_handler = RotatingFileHandler(
            log_directory / "application.log",
            maxBytes=50 * 1024 * 1024,
            backupCount=10,
            encoding="utf-8",
        )
        app_handler.setLevel(numeric_level)
        app_formatter = logging.Formatter(DETAILED_FORMAT, DATE_FORMAT)
        app_handler.setFormatter(app_formatter)
        handlers.append(app_handler)
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
    return logging.getLogger(name)

def setup_request_logging(log_dir: Optional[Path] = None) -> logging.Logger:
    log_directory = log_dir or LOG_DIR
    request_logger = logging.getLogger("llm_perf_platform.request")
    request_logger.setLevel(logging.INFO)
    request_logger.propagate = False
    request_handler = TimedRotatingFileHandler(
        log_directory / "request.log",
        when="midnight",
        interval=1,
        backupCount=30,
        encoding="utf-8",
    )
    request_formatter = logging.Formatter(DETAILED_FORMAT, DATE_FORMAT)
    request_handler.setFormatter(request_formatter)
    request_logger.addHandler(request_handler)
    return request_logger

def setup_task_logging(log_dir: Optional[Path] = None) -> logging.Logger:
    log_directory = log_dir or LOG_DIR
    task_logger = logging.getLogger("llm_perf_platform.task")
    task_logger.setLevel(logging.INFO)
    task_logger.propagate = False
    task_handler = RotatingFileHandler(
        log_directory / "task.log",
        maxBytes=50 * 1024 * 1024,
        backupCount=10,
        encoding="utf-8",
    )
    task_formatter = logging.Formatter(DETAILED_FORMAT, DATE_FORMAT)
    task_handler.setFormatter(task_formatter)
    task_logger.addHandler(task_handler)
    return task_logger

__all__ = ["setup_logging", "get_logger", "setup_request_logging", "setup_task_logging", "LOG_DIR"]
