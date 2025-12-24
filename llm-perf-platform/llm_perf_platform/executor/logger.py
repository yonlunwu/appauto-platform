# executor/logger.py
import datetime
import os
from pathlib import Path

# 使用统一的日志配置
try:
    from llm_perf_platform.utils.logging_config import TASKS_LOG_DIR
    LOG_DIR = TASKS_LOG_DIR
except ImportError:
    # 降级方案
    DEFAULT_BASE_DIR = Path(__file__).resolve().parents[3] / "logs" / "tasks"
    LOG_DIR = Path(os.getenv("LLM_PERF_TASK_LOG_DIR", DEFAULT_BASE_DIR))


class TaskLogger:
    def __init__(self, task_uuid: str, display_id: int):
        """Initialize task logger with UUID-based file naming

        Args:
            task_uuid: Task UUID (used in filename for uniqueness)
            display_id: Display ID (used in filename for readability)
        """
        self.task_uuid = task_uuid
        self.display_id = display_id
        LOG_DIR.mkdir(parents=True, exist_ok=True)

        # Filename format: {display_id}_{uuid}.log
        # Example: 1_550e8400-e29b-41d4-a716-446655440000.log
        self.file_path = LOG_DIR / f"{display_id}_{task_uuid}.log"

        # Delete existing log file to prevent appending to old logs
        # This ensures each task starts with a clean log file
        if self.file_path.exists():
            self.file_path.unlink()

    def _write(self, level: str, msg: str) -> None:
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{ts}][{level}] {msg}\n"
        with self.file_path.open("a", encoding="utf-8") as handle:
            handle.write(line)

    def info(self, msg: str) -> None:
        self._write("INFO", msg)

    def error(self, msg: str) -> None:
        self._write("ERROR", msg)

    def warning(self, msg: str) -> None:
        self._write("WARNING", msg)

    def debug(self, msg: str) -> None:
        self._write("DEBUG", msg)
