from __future__ import annotations

import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from openpyxl import Workbook


DEFAULT_BASE_DIR = Path(__file__).resolve().parents[2]
BASE_DIR = Path(os.getenv("LLM_PERF_BASE_DIR", DEFAULT_BASE_DIR))
RESULTS_DIR = Path(os.getenv("LLM_PERF_RESULTS_DIR", BASE_DIR / "results"))
ARCHIVES_DIR = Path(os.getenv("LLM_PERF_ARCHIVES_DIR", BASE_DIR / "archives"))


class ResultStorage:
    """Handles persisting Excel results and archiving files."""

    def __init__(self) -> None:
        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        ARCHIVES_DIR.mkdir(parents=True, exist_ok=True)

    def persist_result(
        self,
        *,
        task_id: int,
        parameters: Dict[str, Any],
        summary: Dict[str, Any],
        request_rows: List[Dict[str, Any]],
    ) -> str:
        # Use simple task_id naming (display_id will be passed as task_id)
        # Filename format: task_{display_id}.xlsx
        filename = f"task_{task_id}.xlsx"
        file_path = RESULTS_DIR / filename

        wb = Workbook()
        ws_summary = wb.active
        ws_summary.title = "summary"

        ws_summary.append(["task_id", task_id])
        ws_summary.append(["engine", parameters.get("engine")])
        ws_summary.append(["model", parameters.get("model")])
        ws_summary.append(["input_length", parameters.get("input_length")])
        ws_summary.append(["output_length", parameters.get("output_length")])
        ws_summary.append(["concurrency", parameters.get("concurrency")])
        ws_summary.append(["loop", parameters.get("loop")])
        ws_summary.append(["warmup", parameters.get("warmup")])

        ws_summary.append([])
        ws_summary.append(["metrics_key", "value"])
        for key, value in summary.items():
            ws_summary.append([key, value])

        ws_details = wb.create_sheet("requests")
        ws_details.append(
            [
                "index",
                "round",
                "slot",
                "latency",
                "tokens",
                "tokens_per_s",
                "success",
                "error",
            ]
        )
        for idx, row in enumerate(request_rows, start=1):
            ws_details.append(
                [
                    idx,
                    row.get("round"),
                    row.get("slot"),
                    row.get("latency"),
                    row.get("tokens"),
                    row.get("tokens_per_s"),
                    row.get("success"),
                    row.get("error"),
                ]
            )

        wb.save(file_path)
        return str(file_path)

    def archive_result(self, *, engine: str, model: str, source_path: str) -> str:
        source = Path(source_path)
        if not source.exists():
            raise FileNotFoundError(f"Result file not found: {source_path}")

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        target_dir = ARCHIVES_DIR / engine / model / timestamp
        target_dir.mkdir(parents=True, exist_ok=True)

        destination = target_dir / source.name
        shutil.move(str(source), destination)
        return str(destination)

    @staticmethod
    def delete_file(path: str | None) -> None:
        if not path:
            return
        candidate = Path(path)
        if candidate.exists():
            candidate.unlink()

