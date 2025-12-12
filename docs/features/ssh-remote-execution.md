# SSH 远程执行功能说明

## 概述

perftest-platform 现已支持通过 SSH 远程执行 evalscope 性能测试，允许您在远程服务器上运行真实的 LLM 性能测试，并支持基于远程硬件信息的智能并发探测。

## 新增功能

### 1. 远程 SSH 执行

- **本地执行模式**：在运行平台的本地机器上执行测试（需要本地安装 evalscope）
- **远程执行模式**：通过 SSH 连接到远程服务器执行测试

### 2. SSH 认证支持

- **密钥认证**（推荐）：使用 SSH 私钥文件进行身份验证
- **密码认证**：使用用户名和密码进行身份验证

### 3. 硬件感知的并发探测

系统会自动连接到远程服务器，获取以下硬件信息：
- GPU 型号和显存信息
- CPU 核心数
- 系统内存

基于这些信息，智能调整并发建议，提供更准确的性能测试配置。

### 4. 真实 evalscope 集成

- 支持本地和远程 evalscope 命令执行
- 自动构建 evalscope 命令参数
- 解析 evalscope JSON 输出
- 生成详细的性能指标报告

## 使用指南

### 前端使用

1. **登录系统**
2. **选择执行模式**：
   - 在"执行模式"下拉菜单中选择"远程执行 (SSH)"
3. **配置 SSH 连接**：
   - 勾选"配置 SSH 连接"
   - 填写以下信息：
     - **主机地址**：远程服务器 IP 或域名（例如：192.168.1.100）
     - **端口**：SSH 端口（默认 22）
     - **用户名**：SSH 登录用户名
     - **认证方式**：选择"密钥认证"或"密码认证"
     - **密钥认证**：
       - 私钥路径：SSH 私钥文件路径（例如：~/.ssh/id_rsa）
       - 密钥密码：如果私钥有密码保护，填写密码（可选）
     - **密码认证**：
       - 密码：SSH 登录密码
     - **超时时间**：连接超时时间（秒，默认 30）

4. **自动并发探测**：
   - 点击"自动计算最大并发"按钮
   - 系统会连接到远程服务器获取硬件信息
   - 基于 GPU 显存和型号自动计算最优并发数

5. **启动测试**：
   - 配置其他测试参数（引擎、模型、输入/输出长度等）
   - 点击"启动测试"

### API 使用示例

#### 提交远程测试任务

```bash
curl -X POST http://localhost:8000/api/tests/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "engine": "vllm",
    "model": "qwen2.5-7b",
    "input_length": 512,
    "output_length": 512,
    "concurrency": 8,
    "loop": 2,
    "warmup": true,
    "execution_mode": "remote",
    "ssh_config": {
      "host": "192.168.1.100",
      "port": 22,
      "user": "llmuser",
      "auth_type": "key",
      "private_key_path": "/home/user/.ssh/id_rsa",
      "timeout": 30
    }
  }'
```

#### 硬件感知并发探测

```bash
curl -X POST http://localhost:8000/api/tests/concurrency/probe \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "engine": "vllm",
    "model": "qwen2.5-7b",
    "input_length": 512,
    "output_length": 512,
    "ssh_config": {
      "host": "192.168.1.100",
      "port": 22,
      "user": "llmuser",
      "auth_type": "key",
      "private_key_path": "/home/user/.ssh/id_rsa",
      "timeout": 30
    }
  }'
```

响应示例：
```json
{
  "suggested": 32,
  "engine_baseline": 32,
  "normalized_ctx": 0.5,
  "estimated_latency": 0.125,
  "method": "hardware-aware",
  "model": "qwen2.5-7b",
  "hardware_info": {
    "gpus": [
      {
        "name": "NVIDIA A100",
        "memory_total_mb": 81920,
        "memory_free_mb": 79872
      }
    ],
    "cpu_count": 64,
    "memory_total_gb": 512,
    "memory_free_gb": 480
  }
}
```

## 技术架构

### 后端模块

1. **executor/ssh_client.py**：SSH 连接管理器
   - 支持异步 SSH 连接（基于 asyncssh）
   - 支持流式命令输出
   - 硬件信息探测

2. **executor/evalscope_cmd.py**：evalscope 命令构建器
   - 根据参数构建 evalscope 命令
   - 解析 evalscope JSON 输出
   - 计算性能指标摘要

3. **executor/runner.py**：重构的 EvalScopeRunner
   - 支持本地、远程、模拟三种执行模式
   - 自动检测 evalscope 是否安装
   - Warmup 和主测试流程

4. **services/concurrency.py**：增强的并发探测服务
   - 基于硬件信息的智能并发估算
   - GPU 显存感知
   - Fallback 到启发式算法

### 数据模型

- **TaskRecord.ssh_config**：存储 SSH 配置（JSON 字段）
- **TestRunRequest.ssh_config**：SSH 配置 Pydantic 模型
- **TestRunRequest.execution_mode**：执行模式（local/remote）

### 前端组件

- SSH 配置表单（可折叠）
- 执行模式选择
- 实时硬件信息显示（在并发探测结果中）

## 安全注意事项

1. **私钥文件权限**：确保私钥文件权限为 600
   ```bash
   chmod 600 ~/.ssh/id_rsa
   ```

2. **SSH 主机验证**：当前版本跳过了 known_hosts 验证（`known_hosts=None`），生产环境应启用

3. **凭证存储**：SSH 密码存储在数据库中，建议使用密钥认证

4. **网络安全**：确保 SSH 端口仅对可信网络开放

## 依赖要求

### 后端新增依赖

```toml
asyncssh>=2.14.0
paramiko>=3.4.0
```

### 远程服务器要求

1. 安装 evalscope：
   ```bash
   pip install evalscope
   ```

2. 配置 SSH 服务：
   ```bash
   sudo systemctl enable ssh
   sudo systemctl start ssh
   ```

3. GPU 环境（如需 GPU 测试）：
   - NVIDIA 驱动
   - CUDA
   - nvidia-smi 可用

## 故障排查

### 1. SSH 连接失败

**错误**：Connection timeout
**解决**：
- 检查远程服务器 IP 和端口是否正确
- 确认防火墙允许 SSH 连接
- 验证 SSH 服务正在运行

### 2. 认证失败

**错误**：Authentication failed
**解决**：
- 密钥认证：确认私钥路径正确，权限为 600
- 密码认证：确认用户名和密码正确
- 检查远程服务器 SSH 配置（/etc/ssh/sshd_config）

### 3. evalscope 未找到

**错误**：evalscope: command not found
**解决**：
- 在远程服务器安装 evalscope
- 检查 PATH 环境变量
- 系统会自动 fallback 到模拟模式

### 4. GPU 信息获取失败

**错误**：No NVIDIA GPU
**解决**：
- 确认远程服务器安装了 NVIDIA 驱动
- 检查 nvidia-smi 命令可用
- 系统会使用基础启发式算法

## 下一步开发计划

- [ ] SSH 密钥管理界面
- [ ] 多服务器配置模板
- [ ] 实时日志流传输到前端
- [ ] SSH 连接池复用
- [ ] 支持 SSH 跳板机（Bastion）
- [ ] 自动化部署脚本

## 示例场景

### 场景 1：远程 A100 服务器性能测试

```python
# 配置
- 主机：gpu-server-01.example.com
- 用户：llmuser
- 认证：私钥（~/.ssh/id_rsa_gpu）
- 引擎：vllm
- 模型：qwen2.5-72b
- 输入/输出：2048/2048 tokens

# 结果
- 自动探测到 A100 80GB
- 建议并发：64
- 实测吞吐量：1250 tokens/s
- P95 延迟：3.2s
```

### 场景 2：多服务器对比测试

分别在 A100、A10、V100 服务器上运行相同测试，对比性能差异。

## 参考链接

- [evalscope 文档](https://github.com/modelscope/evalscope)
- [asyncssh 文档](https://asyncssh.readthedocs.io/)
- [FastAPI 文档](https://fastapi.tiangolo.com/)
