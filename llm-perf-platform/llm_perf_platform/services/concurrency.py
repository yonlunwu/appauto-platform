import asyncio
import random
from typing import Dict, Optional


ENGINE_BASELINES = {
    "vllm": 32,
    "torch": 16,
    "evalscope": 24,
}

GPU_MEMORY_BASELINES = {
    "A100": 80,
    "A10": 24,
    "V100": 32,
    "T4": 16,
    "4090": 24,
    "3090": 24,
}


class ConcurrencyService:
    """Enhanced concurrency estimator with hardware-aware suggestions."""

    def estimate(
        self,
        *,
        engine: str,
        model: str,
        input_length: int,
        output_length: int,
        ssh_config: Optional[Dict] = None,
    ) -> Dict[str, int | float | str]:
        if ssh_config:
            return asyncio.run(
                self._estimate_with_hardware(
                    engine=engine,
                    model=model,
                    input_length=input_length,
                    output_length=output_length,
                    ssh_config=ssh_config,
                )
            )
        else:
            return self._estimate_heuristic(
                engine=engine,
                model=model,
                input_length=input_length,
                output_length=output_length,
            )

    async def _estimate_with_hardware(
        self,
        *,
        engine: str,
        model: str,
        input_length: int,
        output_length: int,
        ssh_config: Dict,
    ) -> Dict:
        from llm_perf_platform.executor.ssh_client import SSHClient

        try:
            async with SSHClient(ssh_config) as ssh:
                hardware_info = await ssh.get_hardware_info()

            baseline = ENGINE_BASELINES.get(engine.lower(), 12)
            combined_tokens = max(1, input_length + output_length)
            normalized = combined_tokens / 2048

            if hardware_info["gpus"]:
                gpu_name = hardware_info["gpus"][0]["name"]
                gpu_memory_free = hardware_info["gpus"][0]["memory_free_mb"]

                for key, memory_gb in GPU_MEMORY_BASELINES.items():
                    if key in gpu_name:
                        memory_factor = (gpu_memory_free / 1024) / memory_gb
                        baseline = int(baseline * max(0.5, min(2.0, memory_factor)))
                        break

            suggestion = int(max(1, baseline / normalized))
            suggestion = min(suggestion, 128)

            est_latency = round(0.25 * normalized, 3)

            return {
                "suggested": suggestion,
                "engine_baseline": ENGINE_BASELINES.get(engine.lower(), 12),
                "normalized_ctx": round(normalized, 3),
                "estimated_latency": est_latency,
                "method": "hardware-aware",
                "model": model,
                "hardware_info": hardware_info,
            }

        except Exception as e:
            return {
                **self._estimate_heuristic(engine, model, input_length, output_length),
                "hardware_error": str(e),
                "method": "heuristic-fallback",
            }

    def _estimate_heuristic(
        self,
        engine: str,
        model: str,
        input_length: int,
        output_length: int,
    ) -> Dict[str, int | float | str]:
        baseline = ENGINE_BASELINES.get(engine.lower(), 12)
        combined_tokens = max(1, input_length + output_length)
        normalized = combined_tokens / 2048

        jitter = random.uniform(0.85, 1.15)
        suggestion = int(max(1, baseline / (normalized * jitter)))
        suggestion = min(suggestion, 64)

        est_latency = round(0.25 * normalized * jitter, 3)

        return {
            "suggested": suggestion,
            "engine_baseline": baseline,
            "normalized_ctx": round(normalized, 3),
            "estimated_latency": est_latency,
            "method": "heuristic-estimator",
            "model": model,
        }
