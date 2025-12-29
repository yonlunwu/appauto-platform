"""硬件信息收集执行器

通过 SSH 连接到远程机器，收集硬件配置信息，生成详细的硬件报告。
"""
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

from llm_perf_platform.executor.base_executor import BaseExecutor, ExecutionResult
from llm_perf_platform.executor.ssh_client import SSHClient
from llm_perf_platform.storage.results import RESULTS_DIR


class HardwareInfoExecutor(BaseExecutor):
    """硬件信息收集执行器

    连接到远程机器，执行硬件信息收集脚本，生成 JSON 格式的报告。

    收集的信息包括：
    - GPU/NPU 信息（支持 NVIDIA、华为 Ascend、沐曦）
    - CPU 信息（lscpu, /proc/cpuinfo）
    - 内存信息（free）
    - 磁盘信息（df）
    - 操作系统信息（uname, /etc/os-release）
    - 网络信息（ifconfig/ip addr）
    """

    def __init__(self, task_id: int, timeout: int = 300):
        """初始化硬件信息收集执行器

        Args:
            task_id: 任务ID
            timeout: 执行超时时间（秒），默认 5 分钟
        """
        super().__init__(task_id)
        self.timeout = timeout

    async def execute(self, payload: Dict[str, Any]) -> ExecutionResult:
        """执行硬件信息收集

        Args:
            payload: 任务参数字典，必须包含：
                - ssh_config: SSH 连接配置
                    - host: 主机地址
                    - port: SSH 端口
                    - user: 用户名
                    - password/key_path: 认证信息
                - display_id: 显示 ID（用于文件命名）

        Returns:
            ExecutionResult: 执行结果，包含硬件信息 JSON 文件路径
        """
        ssh_config = payload.get("ssh_config")
        if not ssh_config:
            error_msg = "SSH configuration is required for hardware info collection"
            self.log_error(error_msg)
            return ExecutionResult(
                success=False,
                summary={"error": error_msg},
                error=error_msg,
            )

        display_id = payload.get("display_id", self.task_id)

        self.log_info(f"Starting hardware info collection for host: {ssh_config.get('host')}")

        try:
            # 连接到远程机器
            async with SSHClient(ssh_config) as ssh:
                self.log_info("SSH connection established")

                # 收集硬件信息
                hardware_info = await self._collect_hardware_info(ssh)

                # 添加元数据
                hardware_info["metadata"] = {
                    "collection_time": datetime.now().isoformat(),
                    "task_id": self.task_id,
                    "display_id": display_id,
                    "remote_host": ssh_config.get("host"),
                }

                # 保存到 JSON 文件
                output_file = await self._save_hardware_info(display_id, hardware_info)

                self.log_info(f"Hardware info collected successfully: {output_file}")

                return ExecutionResult(
                    success=True,
                    output_file=str(output_file),
                    summary={
                        "output_file": str(output_file),
                        "host": ssh_config.get("host"),
                        "collection_time": hardware_info["metadata"]["collection_time"],
                        "gpu_count": len(hardware_info.get("gpus", [])),
                        "cpu_count": hardware_info.get("cpu_cores", 0),
                        "memory_total_gb": hardware_info.get("memory_total_gb", 0),
                    },
                )

        except Exception as e:
            error_msg = f"Failed to collect hardware info: {str(e)}"
            self.log_error(error_msg)
            return ExecutionResult(
                success=False,
                summary={"error": error_msg},
                error=error_msg,
            )

    async def _collect_hardware_info(self, ssh: SSHClient) -> Dict[str, Any]:
        """收集所有硬件信息

        Args:
            ssh: SSH 客户端

        Returns:
            包含所有硬件信息的字典
        """
        info = {}

        # GPU 信息
        self.log_info("Collecting GPU information...")
        gpu_info = await self._collect_gpu_info(ssh)
        info["gpus"] = gpu_info

        # CPU 信息
        self.log_info("Collecting CPU information...")
        cpu_info = await self._collect_cpu_info(ssh)
        info.update(cpu_info)

        # 内存信息
        self.log_info("Collecting memory information...")
        memory_info = await self._collect_memory_info(ssh)
        info.update(memory_info)

        # 磁盘信息
        self.log_info("Collecting disk information...")
        disk_info = await self._collect_disk_info(ssh)
        info["disks"] = disk_info

        # 操作系统信息
        self.log_info("Collecting OS information...")
        os_info = await self._collect_os_info(ssh)
        info["os"] = os_info

        # 网络信息
        self.log_info("Collecting network information...")
        network_info = await self._collect_network_info(ssh)
        info["network"] = network_info

        return info

    def _clean_command_output(self, output: str) -> str:
        """清理命令输出，过滤掉 Shell 配置产生的干扰信息

        Args:
            output: 原始命令输出

        Returns:
            清理后的输出
        """
        if not output:
            return ""

        lines = []
        for line in output.split('\n'):
            stripped = line.strip()

            # 跳过 declare -x 声明
            if stripped.startswith('declare -x') or stripped.startswith('declare -'):
                continue
            # 跳过 Authorized users only 提示
            if 'Authorized users only' in line or 'All activities may be monitored' in line:
                continue
            # 跳过空行
            if not stripped:
                continue

            lines.append(line)

        return '\n'.join(lines)

    async def _collect_gpu_info(self, ssh: SSHClient) -> list:
        """收集 GPU/NPU 信息，支持多厂商

        检测顺序：NVIDIA -> 华为 NPU -> 沐曦 GPU

        Returns:
            GPU/NPU 信息列表
        """
        # 1. 尝试 NVIDIA GPU
        gpus = await self._collect_nvidia_gpu(ssh)
        if gpus:
            self.log_info(f"Detected {len(gpus)} NVIDIA GPU(s)")
            return gpus

        # 2. 尝试华为 NPU
        gpus = await self._collect_huawei_npu(ssh)
        if gpus:
            self.log_info(f"Detected {len(gpus)} Huawei NPU(s)")
            return gpus

        # 3. 尝试沐曦 GPU
        gpus = await self._collect_mthreads_gpu(ssh)
        if gpus:
            self.log_info(f"Detected {len(gpus)} Moore Threads GPU(s)")
            return gpus

        self.log_info("No GPU/NPU detected")
        return []

    async def _collect_nvidia_gpu(self, ssh: SSHClient) -> list:
        """收集 NVIDIA GPU 信息

        Returns:
            NVIDIA GPU 信息列表
        """
        cmd = "nvidia-smi --query-gpu=index,name,driver_version,memory.total,memory.free,memory.used,temperature.gpu,utilization.gpu --format=csv,noheader,nounits 2>/dev/null"
        stdout, stderr, returncode = await ssh.execute(cmd)

        if returncode != 0:
            return []

        # 清理输出
        stdout = self._clean_command_output(stdout)
        if not stdout.strip():
            return []

        gpus = []
        for line in stdout.strip().split("\n"):
            if not line.strip():
                continue

            try:
                parts = [p.strip() for p in line.split(",")]
                if len(parts) >= 8:
                    gpus.append({
                        "vendor": "NVIDIA",
                        "index": int(parts[0]),
                        "name": parts[1],
                        "driver_version": parts[2],
                        "memory_total_mb": int(float(parts[3])),
                        "memory_free_mb": int(float(parts[4])),
                        "memory_used_mb": int(float(parts[5])),
                        "temperature_c": int(float(parts[6])) if parts[6] != "N/A" else None,
                        "utilization_percent": int(float(parts[7])) if parts[7] != "N/A" else None,
                    })
            except (ValueError, IndexError) as e:
                self.log_warning(f"Failed to parse NVIDIA GPU line '{line}': {e}")
                continue

        return gpus

    async def _collect_huawei_npu(self, ssh: SSHClient) -> list:
        """收集华为 NPU (Ascend) 信息

        Returns:
            华为 NPU 信息列表
        """
        # 先检查 npu-smi 是否存在
        check_cmd = "which npu-smi 2>/dev/null"
        stdout, _, returncode = await ssh.execute(check_cmd)
        if returncode != 0:
            return []

        # 获取 NPU 列表
        cmd = "npu-smi info 2>/dev/null"
        stdout, stderr, returncode = await ssh.execute(cmd)

        if returncode != 0:
            return []

        stdout = self._clean_command_output(stdout)
        if not stdout.strip():
            return []

        npus = []
        # 解析 npu-smi info 输出
        # 华为 NPU 的输出格式是每个 NPU 两行：
        # 第一行: | 0     910B4-1             | OK            | 70.7   ...
        # 第二行: | 0                         | 0000:85:00.0  | 0      ...
        lines = stdout.split('\n')

        for line in lines:
            # 匹配 NPU 数据行（以 | 开头）
            if not line.strip().startswith('|'):
                continue

            parts = [p.strip() for p in line.split('|')]
            # 过滤掉表头和分隔线
            if len(parts) < 4 or not parts[1] or parts[1].startswith('NPU') or parts[1].startswith('=') or parts[1].startswith('Chip'):
                continue

            try:
                # parts[1] 的格式是 "0     910B4-1" 或 "0                     "
                # 需要分割出索引和型号
                field1_parts = parts[1].split()
                if not field1_parts or not field1_parts[0].isdigit():
                    continue

                npu_index = int(field1_parts[0])

                # 如果 field1_parts 有第二部分，且包含型号特征（如含有"-"），则这是 NPU 信息行
                if len(field1_parts) >= 2 and '-' in field1_parts[1]:
                    npu_name = field1_parts[1]

                    # 获取详细信息
                    npu_detail = await self._get_huawei_npu_detail(ssh, npu_index)

                    npus.append({
                        "vendor": "Huawei",
                        "type": "NPU",
                        "index": npu_index,
                        "name": npu_name,
                        **npu_detail
                    })
                # 否则这是第二行（Chip 行），跳过

            except (ValueError, IndexError) as e:
                self.log_warning(f"Failed to parse Huawei NPU line '{line}': {e}")
                continue

        return npus

    async def _get_huawei_npu_detail(self, ssh: SSHClient, npu_id: int) -> Dict[str, Any]:
        """获取华为 NPU 详细信息

        Args:
            ssh: SSH 客户端
            npu_id: NPU ID

        Returns:
            NPU 详细信息字典
        """
        detail = {}

        # 获取使用率信息
        cmd = f"npu-smi info -t usages -i {npu_id} 2>/dev/null"
        stdout, _, returncode = await ssh.execute(cmd)

        if returncode == 0:
            stdout = self._clean_command_output(stdout)
            for line in stdout.split('\n'):
                if ':' not in line:
                    continue

                key, value = line.split(':', 1)
                key = key.strip()
                value = value.strip()

                try:
                    if 'HBM Capacity(MB)' in key:
                        detail['memory_total_mb'] = int(value)
                    elif 'HBM Usage Rate(%)' in key:
                        usage_rate = int(value)
                        detail['memory_usage_percent'] = usage_rate
                        if 'memory_total_mb' in detail:
                            detail['memory_used_mb'] = int(detail['memory_total_mb'] * usage_rate / 100)
                            detail['memory_free_mb'] = detail['memory_total_mb'] - detail['memory_used_mb']
                    elif 'Aicore Usage Rate(%)' in key or 'AICore Usage Rate(%)' in key:
                        detail['utilization_percent'] = int(value)
                except (ValueError, KeyError) as e:
                    self.log_warning(f"Failed to parse NPU usage info '{line}': {e}")
                    continue

        # 获取板卡信息
        cmd = f"npu-smi info -t board -i {npu_id} 2>/dev/null"
        stdout, _, returncode = await ssh.execute(cmd)

        if returncode == 0:
            stdout = self._clean_command_output(stdout)
            for line in stdout.split('\n'):
                if ':' not in line:
                    continue

                key, value = line.split(':', 1)
                key = key.strip()
                value = value.strip()

                if 'Software Version' in key:
                    detail['driver_version'] = value
                elif 'Product Name' in key:
                    detail['product_name'] = value
                elif 'Model' in key and 'Model Name' not in key:
                    detail['model'] = value

        return detail

    async def _collect_mthreads_gpu(self, ssh: SSHClient) -> list:
        """收集沐曦 GPU (Moore Threads) 信息

        Returns:
            沐曦 GPU 信息列表
        """
        # 尝试多个可能的命令
        commands = [
            ("mthreads-gmi", "mthreads-gmi -L 2>/dev/null"),
            ("mtgpu-smi", "mtgpu-smi -L 2>/dev/null"),
            ("mt-smi", "mt-smi -L 2>/dev/null"),
        ]

        for cmd_name, list_cmd in commands:
            # 先检查命令是否存在
            check_cmd = f"which {cmd_name} 2>/dev/null"
            stdout, _, returncode = await ssh.execute(check_cmd)
            if returncode != 0:
                continue

            # 执行列表命令
            stdout, _, returncode = await ssh.execute(list_cmd)
            if returncode == 0:
                stdout = self._clean_command_output(stdout)
                if stdout.strip():
                    gpus = await self._parse_mthreads_output(ssh, stdout, cmd_name)
                    if gpus:
                        return gpus

        return []

    async def _parse_mthreads_output(self, ssh: SSHClient, list_output: str, base_cmd: str) -> list:
        """解析沐曦 GPU 输出

        Args:
            ssh: SSH 客户端
            list_output: GPU 列表输出
            base_cmd: 基础命令名称

        Returns:
            GPU 信息列表
        """
        gpus = []

        # 假设输出格式类似 nvidia-smi -L
        # GPU 0: MTT S80 (UUID: GPU-xxx)
        # 或者其他格式，需要灵活解析
        lines = list_output.strip().split('\n')

        for line in lines:
            line = line.strip()
            if not line or line.startswith('=') or line.startswith('-'):
                continue

            # 尝试匹配 "GPU X:" 或 "X:" 格式
            match = re.search(r'(?:GPU\s+)?(\d+)\s*[:：]\s*(.+)', line)
            if match:
                try:
                    index = int(match.group(1))
                    name_info = match.group(2).strip()

                    # 提取名称（去掉 UUID 等信息）
                    name = name_info.split('(')[0].strip() if '(' in name_info else name_info

                    gpu_info = {
                        "vendor": "Moore Threads",
                        "index": index,
                        "name": name,
                    }

                    # 尝试获取更详细信息
                    # 注意：这里的命令格式可能需要根据实际情况调整
                    detail_cmd = f"{base_cmd} -q -i {index} 2>/dev/null"
                    stdout, _, returncode = await ssh.execute(detail_cmd)
                    if returncode == 0:
                        stdout = self._clean_command_output(stdout)
                        # 解析详细信息（格式待确认）
                        detail = self._parse_mthreads_detail(stdout)
                        gpu_info.update(detail)

                    gpus.append(gpu_info)
                except (ValueError, IndexError) as e:
                    self.log_warning(f"Failed to parse Moore Threads GPU line '{line}': {e}")
                    continue

        return gpus

    def _parse_mthreads_detail(self, detail_output: str) -> Dict[str, Any]:
        """解析沐曦 GPU 详细信息

        Args:
            detail_output: 详细信息输出

        Returns:
            解析后的信息字典
        """
        detail = {}

        # 这里需要根据实际的输出格式来解析
        # 目前先做简单的键值对解析
        for line in detail_output.split('\n'):
            if ':' in line:
                key, value = line.split(':', 1)
                key = key.strip().lower()
                value = value.strip()

                if 'memory' in key and 'total' in key:
                    # 尝试提取内存大小
                    match = re.search(r'(\d+)\s*(?:MB|MiB)', value)
                    if match:
                        detail['memory_total_mb'] = int(match.group(1))
                elif 'driver' in key or 'version' in key:
                    detail['driver_version'] = value
                elif 'temperature' in key:
                    match = re.search(r'(\d+)', value)
                    if match:
                        detail['temperature_c'] = int(match.group(1))
                elif 'utilization' in key or 'usage' in key:
                    match = re.search(r'(\d+)', value)
                    if match:
                        detail['utilization_percent'] = int(match.group(1))

        return detail

    async def _collect_cpu_info(self, ssh: SSHClient) -> Dict[str, Any]:
        """收集 CPU 信息"""
        # CPU 核心数
        cmd_cores = "nproc"
        stdout, _, _ = await ssh.execute(cmd_cores)
        stdout = self._clean_command_output(stdout)
        cpu_cores = int(stdout.strip()) if stdout.strip().isdigit() else 0

        # CPU 型号
        cmd_model = "lscpu | grep 'Model name' | cut -d':' -f2 | xargs"
        stdout, _, _ = await ssh.execute(cmd_model)
        stdout = self._clean_command_output(stdout)
        cpu_model = stdout.strip() or "Unknown"

        # CPU 架构
        cmd_arch = "uname -m"
        stdout, _, _ = await ssh.execute(cmd_arch)
        stdout = self._clean_command_output(stdout)
        cpu_arch = stdout.strip() or "Unknown"

        return {
            "cpu_cores": cpu_cores,
            "cpu_model": cpu_model,
            "cpu_arch": cpu_arch,
        }

    async def _collect_memory_info(self, ssh: SSHClient) -> Dict[str, Any]:
        """收集内存信息（包括使用情况和硬件详情）"""
        memory_info = {}

        # 1. 收集内存使用情况
        cmd = "free -m | grep Mem"
        stdout, _, returncode = await ssh.execute(cmd)

        if returncode == 0:
            stdout = self._clean_command_output(stdout)
            parts = stdout.strip().split()
            if len(parts) >= 7:
                memory_info.update({
                    "memory_total_gb": round(int(parts[1]) / 1024, 2),
                    "memory_used_gb": round(int(parts[2]) / 1024, 2),
                    "memory_free_gb": round(int(parts[3]) / 1024, 2),
                    "memory_available_gb": round(int(parts[6]) / 1024, 2),
                })

        # 2. 收集内存硬件详情（使用 dmidecode）
        # 需要 root 权限，如果失败则跳过
        cmd_dimm = "sudo dmidecode -t memory 2>/dev/null || dmidecode -t memory 2>/dev/null"
        stdout, _, returncode = await ssh.execute(cmd_dimm)

        memory_devices = []
        if returncode == 0 and stdout:
            # 解析 dmidecode 输出
            current_device = {}
            for line in stdout.split('\n'):
                line = line.strip()

                # 新的内存设备条目
                if line.startswith('Memory Device'):
                    if current_device and current_device.get('size') and current_device.get('size') != 'No Module Installed':
                        memory_devices.append(current_device)
                    current_device = {}

                # 解析各个字段
                elif ':' in line:
                    key, value = line.split(':', 1)
                    key = key.strip()
                    value = value.strip()

                    if key == 'Size':
                        current_device['size'] = value
                    elif key == 'Type':
                        current_device['type'] = value
                    elif key == 'Speed':
                        current_device['speed'] = value
                    elif key == 'Configured Memory Speed':
                        current_device['configured_speed'] = value
                    elif key == 'Manufacturer':
                        current_device['manufacturer'] = value
                    elif key == 'Part Number':
                        current_device['part_number'] = value
                    elif key == 'Locator':
                        current_device['locator'] = value
                    elif key == 'Form Factor':
                        current_device['form_factor'] = value

            # 添加最后一个设备
            if current_device and current_device.get('size') and current_device.get('size') != 'No Module Installed':
                memory_devices.append(current_device)

        # 3. 汇总内存硬件信息
        if memory_devices:
            memory_info['memory_devices'] = memory_devices
            memory_info['memory_module_count'] = len(memory_devices)

            # 计算总容量（从硬件信息）
            total_hardware_gb = 0
            for device in memory_devices:
                size_str = device.get('size', '')
                if 'GB' in size_str:
                    try:
                        total_hardware_gb += int(size_str.split()[0])
                    except:
                        pass
                elif 'MB' in size_str:
                    try:
                        total_hardware_gb += int(size_str.split()[0]) / 1024
                    except:
                        pass

            if total_hardware_gb > 0:
                memory_info['memory_hardware_total_gb'] = round(total_hardware_gb, 2)

            # 提取通用信息（从第一个内存条）
            if memory_devices:
                first_device = memory_devices[0]
                memory_info['memory_type'] = first_device.get('type', 'Unknown')
                memory_info['memory_speed'] = first_device.get('speed', 'Unknown')
                memory_info['memory_configured_speed'] = first_device.get('configured_speed', 'Unknown')

        return memory_info if memory_info else {"memory_total_gb": 0, "memory_free_gb": 0, "memory_used_gb": 0}

    async def _collect_disk_info(self, ssh: SSHClient) -> list:
        """收集磁盘信息"""
        cmd = "df -h | grep '^/dev'"
        stdout, _, returncode = await ssh.execute(cmd)

        if returncode != 0:
            return []

        stdout = self._clean_command_output(stdout)
        disks = []
        for line in stdout.strip().split("\n"):
            if line.strip():
                parts = line.split()
                if len(parts) >= 6:
                    disks.append({
                        "device": parts[0],
                        "size": parts[1],
                        "used": parts[2],
                        "available": parts[3],
                        "use_percent": parts[4],
                        "mount_point": parts[5],
                    })
        return disks

    async def _collect_os_info(self, ssh: SSHClient) -> Dict[str, Any]:
        """收集操作系统信息"""
        # OS 发行版
        cmd_os = "cat /etc/os-release | grep '^PRETTY_NAME=' | cut -d'=' -f2 | tr -d '\"'"
        stdout, _, _ = await ssh.execute(cmd_os)
        stdout = self._clean_command_output(stdout)
        os_name = stdout.strip() or "Unknown"

        # 内核版本
        cmd_kernel = "uname -r"
        stdout, _, _ = await ssh.execute(cmd_kernel)
        stdout = self._clean_command_output(stdout)
        kernel_version = stdout.strip() or "Unknown"

        # 主机名
        cmd_hostname = "hostname"
        stdout, _, _ = await ssh.execute(cmd_hostname)
        stdout = self._clean_command_output(stdout)
        hostname = stdout.strip() or "Unknown"

        return {
            "name": os_name,
            "kernel_version": kernel_version,
            "hostname": hostname,
        }

    async def _collect_network_info(self, ssh: SSHClient) -> Dict[str, Any]:
        """收集网络信息"""
        # IP 地址（简化版，只获取主要网卡）
        cmd = "hostname -I | awk '{print $1}'"
        stdout, _, _ = await ssh.execute(cmd)
        stdout = self._clean_command_output(stdout)
        primary_ip = stdout.strip() or "Unknown"

        return {
            "primary_ip": primary_ip,
        }

    async def _save_hardware_info(self, display_id: int, info: Dict[str, Any]) -> Path:
        """保存硬件信息到 JSON 文件

        Args:
            display_id: 显示 ID
            info: 硬件信息字典

        Returns:
            保存的文件路径
        """
        # 确保 results 目录存在
        RESULTS_DIR.mkdir(parents=True, exist_ok=True)

        # 生成文件名：hardware_info_{display_id}_{timestamp}.json
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"hardware_info_{display_id}_{timestamp}.json"
        file_path = RESULTS_DIR / filename

        # 保存为格式化的 JSON
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(info, f, indent=2, ensure_ascii=False)

        self.log_info(f"Hardware info saved to: {file_path}")
        return file_path
