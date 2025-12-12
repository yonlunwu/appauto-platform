import os
from pathlib import Path

from sqlmodel import SQLModel, Session, create_engine

# ensure models registered
from llm_perf_platform.models import task_record  # noqa: F401
from llm_perf_platform.models import user_account  # noqa: F401
from llm_perf_platform.models import model_instance  # noqa: F401

# 数据库存放在项目根目录下，可用环境变量覆盖
DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "database.db"
DB_PATH = Path(os.getenv("LLM_PERF_DB_PATH", DEFAULT_DB_PATH))
DATABASE_URL = f"sqlite:///{DB_PATH}"

# 创建 engine
engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)


def init_db():
    """初始化数据库，创建所有表。"""
    SQLModel.metadata.create_all(engine)


def get_session() -> Session:
    """获取 Session，用于 CRUD 操作"""
    return Session(engine, expire_on_commit=False)

