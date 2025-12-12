# LLM 性能测试平台

基于 FastAPI + React 的大模型性能测试平台，集成 appauto 实现完整的模型测试和管理能力。

## 主要特性

- ✅ **性能测试**：支持 vLLM、SGLang、FTransformers 多引擎性能测试
- ✅ **远程执行**：通过 SSH 连接远程服务器执行测试
- ✅ **智能并发**：基于 GPU 硬件信息的智能并发探测
- ✅ **模型管理**：模型扫描、启动、停止、健康检查
- ✅ **基础测试**：集成 pytest 执行功能测试
- ✅ **结果管理**：Excel 报告生成、归档、下载
- ✅ **用户认证**：基础的注册、登录和权限控制

## 快速开始

详细的安装和使用指南，请查看：

📚 **[快速开始指南 (QUICKSTART.md)](../QUICKSTART.md)**

📚 **[SSH 远程执行说明 (SSH_REMOTE_EXECUTION.md)](../SSH_REMOTE_EXECUTION.md)**

📚 **[系统设计文档 (设计文档.md)](../设计文档.md)**

## 基础命令

### 启动后端

```bash
cd llm-perf-platform
uv venv
source .venv/bin/activate
uv sync
uvicorn llm_perf_platform.main:app --host 0.0.0.0 --port 8000 --reload
```

### 启动前端

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

### 运行测试

```bash
source .venv/bin/activate
pytest
```

## 访问方式

- **后端 API**: http://localhost:8000/docs
- **前端 UI**: http://localhost:5173
- **健康检查**: http://localhost:8000/

## 项目结构

```
llm-perf-platform/
├── llm_perf_platform/          # 后端源代码
│   ├── api/                    # API 路由
│   ├── executor/               # 执行器
│   ├── models/                 # 数据模型
│   ├── services/               # 业务服务
│   ├── storage/                # 文件存储
│   └── tasks/                  # 任务调度
├── frontend/                   # 前端代码 (React + TypeScript)
├── config/                     # 配置文件 (模型配置 YAML)
├── tests/                      # 测试代码
└── logs/                       # 日志目录
```

## 技术栈

**后端**:
- FastAPI
- SQLModel + SQLite
- asyncssh
- openpyxl
- appauto

**前端**:
- React
- TypeScript
- Vite

## 开发指南

查看 [QUICKSTART.md](../QUICKSTART.md) 了解详细的开发和部署指南。

## License

待定
