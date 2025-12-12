# 快速开始指南

## 项目概述

**perftest-platform** 是一个基于 evalscope 的 LLM 性能测试平台，支持：
- ✅ 参数化性能测试（input/output length、concurrency、loop、warmup）
- ✅ SSH 远程执行（连接远程服务器进行测试）
- ✅ 智能并发探测（基于 GPU 硬件信息自动推荐）
- ✅ 详细 Excel 报告生成
- ✅ 用户认证和任务管理
- ✅ 现代化 Web UI

**当前状态**: 核心功能完成，可用于生产环境测试

---

## 环境要求

### 后端
- Python 3.10+
- SQLite 3
- （可选）本地安装 evalscope（用于本地模式）

### 前端
- Node.js 18+
- npm 或 pnpm

### 远程服务器（用于远程执行）
- SSH 访问权限
- 已安装 evalscope
- （可选）NVIDIA GPU + nvidia-smi

---

## 安装步骤

### 1. 克隆项目

```bash
cd /path/to/perftest-platform
```

### 2. 后端安装

```bash
cd llm-perf-platform

# 使用 uv 安装依赖（推荐）
uv sync

# 或使用 pip
pip install -e .
```

### 3. 前端安装

```bash
cd frontend
npm install
```

---

## 启动服务

### 启动后端

```bash
cd llm-perf-platform
source .venv/bin/activate  # 如果使用 uv/venv

uvicorn llm_perf_platform.main:app --host 0.0.0.0 --port 8000 --reload
```

后端将运行在: http://localhost:8000

API 文档: http://localhost:8000/docs

### 启动前端

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

前端将运行在: http://localhost:5173

---

## 首次使用

### 1. 注册账号

访问 http://localhost:5173，点击"注册"按钮：
- 输入邮箱（例如：test@example.com）
- 输入密码（至少 8 位）
- 点击"注册并进入"

### 2. 配置测试参数

登录后进入测试控制台：

**基础参数**：
- **引擎**: vllm / torch / evalscope
- **模型**: 模型名称（例如：qwen2.5-7b）
- **输入长度**: 输入 token 数（例如：512）
- **输出长度**: 输出 token 数（例如：512）
- **并发**: 并发数（或使用自动探测）
- **Loop**: 测试轮数（例如：2）
- **Warmup**: 是否预热

### 3. 选择执行模式

#### 本地执行模式（默认）

如果本地已安装 evalscope：
- 执行模式选择"本地执行"
- 直接点击"启动测试"

如果本地未安装 evalscope：
- 系统自动使用模拟模式
- 生成模拟数据用于测试

#### 远程执行模式（推荐）

如果有远程 GPU 服务器：
1. 执行模式选择"远程执行 (SSH)"
2. 勾选"配置 SSH 连接"
3. 填写 SSH 信息：
   ```
   主机地址: 192.168.1.100
   端口: 22
   用户名: llmuser
   认证方式: 密钥认证
   私钥路径: ~/.ssh/id_rsa
   ```
4. 点击"自动计算最大并发"（获取远程硬件信息）
5. 点击"启动测试"

### 4. 查看结果

测试完成后：
- 在"历史任务"表格中查看任务状态
- 点击"下载"按钮获取 Excel 报告
- 点击"归档"保存到归档目录
- 点击"删除"清理任务记录

---

## 使用场景示例

### 场景 1：本地快速测试

```bash
# 适用于：功能验证、开发调试
执行模式: 本地执行
引擎: vllm
模型: qwen2.5-7b
输入长度: 256
输出长度: 256
并发: 4
Loop: 1
Warmup: false
```

### 场景 2：远程 GPU 性能测试

```bash
# 适用于：生产环境压测、性能对比
执行模式: 远程执行 (SSH)
SSH 主机: gpu-server-01.example.com
认证方式: 密钥认证
引擎: vllm
模型: qwen2.5-72b
输入长度: 2048
输出长度: 2048
并发: 自动探测（基于 A100 显存）
Loop: 10
Warmup: true
```

### 场景 3：多服务器对比测试

分别在不同服务器上运行相同配置：
- A100 服务器（192.168.1.100）
- V100 服务器（192.168.1.101）
- A10 服务器（192.168.1.102）

对比 Excel 报告中的吞吐量和延迟指标。

---

## Excel 报告说明

生成的 Excel 包含两个 Sheet：

### Summary Sheet（汇总信息）
| 字段 | 说明 |
|------|------|
| Engine | 使用的引擎 |
| Model | 模型名称 |
| Input Length | 输入 token 数 |
| Output Length | 输出 token 数 |
| Concurrency | 并发数 |
| Loop | 测试轮数 |
| Total Requests | 总请求数 |
| Avg Latency | 平均延迟（秒） |
| P50 Latency | 50 分位延迟 |
| P90 Latency | 90 分位延迟 |
| P95 Latency | 95 分位延迟 |
| P99 Latency | 99 分位延迟 |
| Error Rate | 错误率（0-1） |
| Throughput (tokens/s) | 吞吐量 |

### Requests Sheet（详细请求数据）
| 字段 | 说明 |
|------|------|
| Round | 测试轮次 |
| Slot | 并发槽位 |
| Latency | 请求延迟（秒） |
| Tokens | 总 token 数 |
| Tokens/s | 吞吐率 |
| Success | 是否成功 |
| Error | 错误信息 |

---

## API 使用示例

### 提交测试任务

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
    "execution_mode": "local"
  }'
```

### 查询任务列表

```bash
curl http://localhost:8000/api/tests/list \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 并发探测

```bash
curl -X POST http://localhost:8000/api/tests/concurrency/probe \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "engine": "vllm",
    "model": "qwen2.5-7b",
    "input_length": 512,
    "output_length": 512
  }'
```

---

## 常见问题

### 1. 后端启动失败

**错误**: `ModuleNotFoundError: No module named 'llm_perf_platform'`

**解决**: 确保在虚拟环境中并已安装依赖
```bash
source .venv/bin/activate
uv sync
```

### 2. SSH 连接失败

**错误**: `Connection timeout`

**解决**:
- 检查远程服务器 IP 和端口
- 确认防火墙允许 SSH 连接
- 验证 SSH 服务正在运行

### 3. 前端无法访问后端

**错误**: `Failed to fetch`

**解决**:
- 确认后端运行在 http://localhost:8000
- 检查 CORS 配置
- 查看浏览器控制台错误信息

### 4. evalscope 未找到

**提示**: `evalscope not found, falling back to simulation mode`

**说明**: 这不是错误，系统会自动使用模拟模式生成测试数据

**安装 evalscope**（可选）:
```bash
pip install evalscope
```

---

## 运行测试

### 后端测试

```bash
cd llm-perf-platform
pytest
```

### 前端测试

```bash
cd frontend
npm run test  # 如果配置了测试
```

---

## 目录结构

```
perftest-platform/
├── llm-perf-platform/          # 后端
│   ├── llm_perf_platform/      # 源代码
│   │   ├── api/                # API 层
│   │   ├── models/             # 数据模型
│   │   ├── services/           # 业务逻辑
│   │   ├── executor/           # 执行器
│   │   ├── tasks/              # 任务调度
│   │   └── storage/            # 文件存储
│   ├── perftest/                  # 测试
│   ├── results/                # 测试结果
│   ├── archives/               # 归档目录
│   └── database.db             # SQLite 数据库
│
├── frontend/                   # 前端
│   ├── src/
│   │   ├── App.tsx             # 主应用
│   │   ├── api.ts              # API 客户端
│   │   ├── types.ts            # TypeScript 类型
│   │   └── styles.css          # 样式
│   └── package.json
│
├── PROGRESS.md                 # 详细进度追踪
├── SSH_REMOTE_EXECUTION.md     # SSH 功能文档
├── QUICKSTART.md               # 本文档
└── 设计文档.md                  # 架构设计
```

---

## 下一步

- 查看 `PROGRESS.md` 了解项目完整进度
- 查看 `SSH_REMOTE_EXECUTION.md` 了解远程执行详细配置
- 查看 `设计文档.md` 了解系统架构设计

---

## 获取帮助

遇到问题请：
1. 检查本文档的常见问题部分
2. 查看后端日志: `logs/` 目录
3. 查看 API 文档: http://localhost:8000/docs
4. 提交 Issue 到项目仓库

---

**祝使用愉快！** 🚀
