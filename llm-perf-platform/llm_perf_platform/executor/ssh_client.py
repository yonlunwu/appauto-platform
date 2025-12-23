import asyncio
import logging
from llm_perf_platform.utils.logging_config import get_logger
from pathlib import Path
from typing import Dict, Optional, Tuple

import asyncssh
from asyncssh import SSHClientConnection


logger = get_logger(__name__)


class SSHClient:
    def __init__(self, config: Dict):
        self.host = config["host"]
        self.port = config.get("port", 22)
        self.user = config["user"]
        self.auth_type = config.get("auth_type", "key")
        self.password = config.get("password")
        self.private_key_path = config.get("private_key_path")
        self.passphrase = config.get("passphrase")
        self.timeout = config.get("timeout", 30)
        self.conn: Optional[SSHClientConnection] = None

    async def connect(self) -> None:
        logger.info(f"Connecting to {self.user}@{self.host}:{self.port}")

        connect_kwargs = {
            "host": self.host,
            "port": self.port,
            "username": self.user,
            "known_hosts": None,
            "connect_timeout": self.timeout,
        }

        if self.auth_type == "password":
            if not self.password:
                raise ValueError("Password is required for password authentication")
            connect_kwargs["password"] = self.password
        elif self.auth_type == "key":
            if self.private_key_path:
                key_path = Path(self.private_key_path).expanduser()
                connect_kwargs["client_keys"] = [str(key_path)]
            if self.passphrase:
                connect_kwargs["passphrase"] = self.passphrase

        try:
            self.conn = await asyncssh.connect(**connect_kwargs)
            logger.info(f"Successfully connected to {self.host}")
        except Exception as e:
            logger.error(f"Failed to connect to {self.host}: {e}")
            raise

    async def disconnect(self) -> None:
        if self.conn:
            self.conn.close()
            await self.conn.wait_closed()
            logger.info(f"Disconnected from {self.host}")

    async def execute(self, command: str, timeout: Optional[int] = None) -> Tuple[str, str, int]:
        if not self.conn:
            raise RuntimeError("Not connected. Call connect() first.")

        timeout = timeout or self.timeout
        logger.info(f"Executing command: {command}")

        try:
            result = await asyncio.wait_for(
                self.conn.run(command, check=False),
                timeout=timeout
            )

            stdout = result.stdout.strip() if result.stdout else ""
            stderr = result.stderr.strip() if result.stderr else ""
            returncode = result.exit_status or 0

            logger.debug(f"Command exit code: {returncode}")
            if stderr:
                logger.warning(f"Command stderr: {stderr}")

            return stdout, stderr, returncode

        except asyncio.TimeoutError:
            logger.error(f"Command timed out after {timeout}s")
            raise TimeoutError(f"Command execution timed out after {timeout}s")
        except Exception as e:
            logger.error(f"Command execution failed: {e}")
            raise

    async def execute_streaming(self, command: str, callback, timeout: Optional[int] = None):
        if not self.conn:
            raise RuntimeError("Not connected. Call connect() first.")

        timeout = timeout or self.timeout
        logger.info(f"Executing command with streaming: {command}")

        try:
            async with self.conn.create_process(command) as process:
                async def read_stream(stream, stream_type):
                    async for line in stream:
                        await callback(stream_type, line.rstrip('\n'))

                stdout_task = asyncio.create_task(read_stream(process.stdout, "stdout"))
                stderr_task = asyncio.create_task(read_stream(process.stderr, "stderr"))

                await asyncio.wait_for(
                    asyncio.gather(stdout_task, stderr_task, process.wait()),
                    timeout=timeout
                )

                return process.returncode

        except asyncio.TimeoutError:
            logger.error(f"Streaming command timed out after {timeout}s")
            raise TimeoutError(f"Command execution timed out after {timeout}s")
        except Exception as e:
            logger.error(f"Streaming command execution failed: {e}")
            raise

    async def get_hardware_info(self) -> Dict:
        logger.info("Gathering hardware information")

        commands = {
            "gpu_info": "nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits 2>/dev/null || echo 'No NVIDIA GPU'",
            "cpu_count": "nproc",
            "memory_total": "free -g | grep Mem | awk '{print $2}'",
            "memory_free": "free -g | grep Mem | awk '{print $7}'",
        }

        hardware_info = {}

        for key, cmd in commands.items():
            try:
                stdout, stderr, returncode = await self.execute(cmd)
                if returncode == 0:
                    hardware_info[key] = stdout
                else:
                    hardware_info[key] = None
            except Exception as e:
                logger.warning(f"Failed to get {key}: {e}")
                hardware_info[key] = None

        return self._parse_hardware_info(hardware_info)

    def _parse_hardware_info(self, raw_info: Dict) -> Dict:
        parsed = {
            "gpus": [],
            "cpu_count": 0,
            "memory_total_gb": 0,
            "memory_free_gb": 0,
        }

        if raw_info.get("gpu_info") and raw_info["gpu_info"] != "No NVIDIA GPU":
            for line in raw_info["gpu_info"].split("\n"):
                if line.strip():
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) == 3:
                        parsed["gpus"].append({
                            "name": parts[0],
                            "memory_total_mb": int(float(parts[1])),
                            "memory_free_mb": int(float(parts[2])),
                        })

        try:
            parsed["cpu_count"] = int(raw_info.get("cpu_count", 0))
        except (ValueError, TypeError):
            pass

        try:
            parsed["memory_total_gb"] = int(raw_info.get("memory_total", 0))
        except (ValueError, TypeError):
            pass

        try:
            parsed["memory_free_gb"] = int(raw_info.get("memory_free", 0))
        except (ValueError, TypeError):
            pass

        return parsed

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.disconnect()
