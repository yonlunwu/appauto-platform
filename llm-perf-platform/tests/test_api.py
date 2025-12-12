import asyncio
import importlib
import os
import sys
import time
from pathlib import Path

import httpx
import pytest
import sqlmodel  # ensure dependency is available during module import

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

pytestmark = pytest.mark.anyio("asyncio")


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _reload_modules():
    sqlmodel.SQLModel.metadata.clear()
    modules = [
        "llm_perf_platform.models.db",
        "llm_perf_platform.models.task_record",
        "llm_perf_platform.storage.results",
        "llm_perf_platform.executor.logger",
        "llm_perf_platform.services.task_service",
        "llm_perf_platform.tasks.scheduler",
        "llm_perf_platform.main",
    ]
    for name in modules:
        if name in sys.modules:
            del sys.modules[name]
        importlib.import_module(name)


@pytest.fixture
async def api_client(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_PERF_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("LLM_PERF_BASE_DIR", str(tmp_path))
    monkeypatch.setenv("LLM_PERF_RESULTS_DIR", str(tmp_path / "results"))
    monkeypatch.setenv("LLM_PERF_ARCHIVES_DIR", str(tmp_path / "archives"))
    monkeypatch.setenv("LLM_PERF_LOG_DIR", str(tmp_path / "logs"))

    _reload_modules()

    from llm_perf_platform.main import create_app
    from llm_perf_platform.models.db import init_db
    from llm_perf_platform.tasks.scheduler import task_scheduler

    init_db()

    app = create_app()
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://perftesterver",
    ) as client:
        yield client

    task_scheduler.shutdown()


async def _wait_for_completion(client: httpx.AsyncClient, task_id: int, timeout: float = 5.0):
    deadline = time.time() + timeout
    last_payload = None
    while time.time() < deadline:
        resp = await client.get(f"/api/tests/{task_id}")
        if resp.status_code == 404:
            break
        payload = resp.json()
        last_payload = payload
        if payload["status"] in {"completed", "failed"}:
            return payload
        await asyncio.sleep(0.05)
    raise AssertionError(f"Task {task_id} did not finish in time; last={last_payload}")


async def test_run_archive_delete_flow(api_client: httpx.AsyncClient):
    payload = {
        "engine": "vllm",
        "model": "qwen2.5-mini",
        "input_length": 128,
        "output_length": 256,
        "loop": 1,
        "warmup": False,
        "auto_concurrency": True,
    }

    response = await api_client.post("/api/tests/run", json=payload)
    assert response.status_code == 200
    body = response.json()
    task_id = body["task_id"]
    assert body["concurrency"] > 0

    detail = await _wait_for_completion(api_client, task_id)
    assert detail["status"] == "completed"
    assert detail["summary"]["total_requests"] == detail["parameters"]["loop"] * detail["parameters"]["concurrency"]

    result_path = Path(detail["result_path"])
    assert result_path.exists()

    download_resp = await api_client.get(f"/api/tests/{task_id}/result")
    assert download_resp.status_code == 200
    assert download_resp.headers.get("content-disposition")

    archive_resp = await api_client.post("/api/tests/archive", json={"task_id": task_id})
    assert archive_resp.status_code == 200
    archived_path = Path(archive_resp.json()["archived_path"])
    assert archived_path.exists()

    delete_resp = await api_client.delete(f"/api/tests/{task_id}")
    assert delete_resp.status_code == 200
    assert delete_resp.json()["deleted"] is True

    final_resp = await api_client.get(f"/api/tests/{task_id}")
    assert final_resp.status_code == 404


async def test_concurrency_probe(api_client: httpx.AsyncClient):
    response = await api_client.post(
        "/api/tests/concurrency/probe",
        json={
            "engine": "vllm",
            "model": "qwen2.5-mini",
            "input_length": 512,
            "output_length": 512,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["suggested"] > 0
    assert data["engine_baseline"] == 32


async def test_ssh_config_storage(api_client: httpx.AsyncClient):
    """Test that SSH configuration is properly stored and retrieved"""
    payload = {
        "engine": "vllm",
        "model": "qwen2.5-mini",
        "input_length": 128,
        "output_length": 256,
        "loop": 1,
        "warmup": False,
        "concurrency": 4,
        "execution_mode": "local",
        "ssh_config": {
            "host": "192.168.1.100",
            "port": 22,
            "user": "testuser",
            "auth_type": "key",
            "private_key_path": "~/.ssh/id_rsa",
            "timeout": 30,
        },
    }

    response = await api_client.post("/api/tests/run", json=payload)
    assert response.status_code == 200
    task_id = response.json()["task_id"]

    detail_resp = await api_client.get(f"/api/tests/{task_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()

    assert detail["ssh_config"] is not None
    assert detail["ssh_config"]["host"] == "192.168.1.100"
    assert detail["ssh_config"]["user"] == "testuser"
    assert detail["ssh_config"]["auth_type"] == "key"

