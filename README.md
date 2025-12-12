# LLM Performance Test Platform

一个专业的大语言模型性能测试平台，支持多种推理引擎和全面的性能指标分析。

> **🚀 快速开始**: 查看 [快速部署指南](docs/deployment/quick-deploy.md) 了解如何一键部署到 Ubuntu 服务器
>
> **📚 完整文档**: 访问 [docs/](docs/) 查看所有文档

## 功能特性

- 🚀 **多引擎支持**: vLLM、SGLang、LMDeploy等主流推理引擎
- 📊 **性能测试**: 吞吐量、延迟、并发度等全面性能指标
- 🔍 **硬件监控**: 自动收集GPU、CPU、内存等硬件信息
- 👥 **用户管理**: 基于角色的访问控制（管理员/普通用户）
- 🎨 **主题切换**: 支持亮色/暗色主题
- 📱 **现代化UI**: 响应式设计，优秀的用户体验
- 🔧 **系统管理**: Appauto版本管理和系统维护功能

## 技术栈

### 后端
- Python 3.11+
- FastAPI
- SQLModel + SQLite
- Alembic（数据库迁移）
- Uvicorn（ASGI服务器）

### 前端
- React 18 + TypeScript
- Vite
- CSS Variables（主题系统）

## 快速开始

### 本地开发

#### 1. 克隆仓库
```bash
git clone <repository-url>
cd perftest-platform
```

#### 2. 后端设置
```bash
cd llm-perf-platform

# 创建虚拟环境
python3.11 -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate  # Windows

# 安装依赖
pip install -e .

# 初始化数据库
alembic upgrade head

# 启动后端服务
uvicorn llm_perf_platform.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 3. 前端设置
```bash
cd frontend

# 安装依赖
npm install

# （可选）配置开发环境 API 地址
# cp .env.example .env
# vi .env  # 如果需要修改 API 地址

# 启动开发服务器
npm run dev
```

访问 http://localhost:5173 即可使用平台。

**注意**：开发环境下，Vite 会自动代理 `/api` 请求到 `http://localhost:8000`。

默认管理员账号：
- 邮箱: `admin@example.com`
- 密码: `admin123`

## 生产环境部署

### 方式一：真·一键部署（最简单，推荐）

在 Ubuntu 服务器上执行一条命令完成所有部署：

```bash
# 1. 克隆代码
git clone <repository-url>
cd perftest-platform

# 2. 一键部署（需要 sudo 权限）
sudo ./one-click-deploy.sh --appauto-path /path/to/appauto
```

就这么简单！脚本会自动完成：
- ✅ 安装所有系统依赖（Python 3.11, Node.js, Nginx 等）
- ✅ 配置后端和前端
- ✅ 初始化数据库
- ✅ 设置 systemd 服务
- ✅ 配置 Nginx 反向代理
- ✅ 启动所有服务

**常用选项**：

```bash
# 基本部署
sudo ./one-click-deploy.sh --appauto-path /opt/appauto

# 使用自定义域名
sudo ./one-click-deploy.sh --appauto-path /opt/appauto --domain example.com

# 启用 HTTPS（需要提前准备好 SSL 证书）
sudo ./one-click-deploy.sh --appauto-path /opt/appauto --domain example.com --ssl

# 自定义后端端口
sudo ./one-click-deploy.sh --appauto-path /opt/appauto --backend-port 9000

# 仅部署代码，不设置服务（用于测试）
sudo ./one-click-deploy.sh --appauto-path /opt/appauto --skip-services --skip-nginx

# 查看所有选项
./one-click-deploy.sh --help
```

**部署后**：
- 访问地址：`http://your-server-ip` 或 `http://your-domain`
- 默认管理员账号：`admin@example.com` / `admin123`
- ⚠️ **重要**：首次登录后立即修改密码！

---

### 方式二：分步部署（更灵活）

如果需要更细粒度的控制，可以分步执行：

```bash
# 1. 克隆代码
git clone <repository-url>
cd perftest-platform

# 2. 确保 appauto 在正确位置
# 默认会在 ../appauto 查找，或者通过环境变量指定

# 3. 运行基础部署脚本
chmod +x deploy.sh
APPAUTO_PATH=/path/to/appauto ./deploy.sh

# 4. 配置环境变量（可选）
cp llm-perf-platform/.env.example llm-perf-platform/.env
vi llm-perf-platform/.env

# 5. 设置系统服务
chmod +x setup-services.sh
sudo ./setup-services.sh

# 6. 配置 Nginx
chmod +x setup-nginx.sh
sudo ./setup-nginx.sh
```

### 方式三：手动部署

#### 系统要求
- Ubuntu 20.04+ / Debian 11+
- Python 3.11+
- Node.js 18+
- Nginx
- SQLite3

#### 安装系统依赖
```bash
sudo apt-get update
sudo apt-get install -y \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3-pip \
    nodejs \
    npm \
    nginx \
    sqlite3 \
    git \
    build-essential
```

#### 后端部署
```bash
cd llm-perf-platform

# 创建虚拟环境
python3.11 -m venv .venv
source .venv/bin/activate

# 安装依赖
pip install --upgrade pip
pip install -e .

# 配置环境变量
cp .env.example .env
vi .env

# 初始化数据库
alembic upgrade head

# 创建必要目录
mkdir -p logs results
```

#### 前端构建
```bash
cd frontend

# 安装依赖
npm install

# 构建生产版本
npm run build
```

#### 配置 systemd 服务

创建 `/etc/systemd/system/llm-perf-backend.service`：

```ini
[Unit]
Description=LLM Performance Test Platform - Backend API
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/perftest-platform/llm-perf-platform
Environment="PATH=/path/to/perftest-platform/llm-perf-platform/.venv/bin"
ExecStart=/path/to/perftest-platform/llm-perf-platform/.venv/bin/uvicorn llm_perf_platform.main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=10

StandardOutput=append:/path/to/perftest-platform/llm-perf-platform/logs/backend.log
StandardError=append:/path/to/perftest-platform/llm-perf-platform/logs/backend-error.log

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl daemon-reload
sudo systemctl enable llm-perf-backend
sudo systemctl start llm-perf-backend
sudo systemctl status llm-perf-backend
```

#### 配置 Nginx

创建 `/etc/nginx/sites-available/llm-perf-platform`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        root /path/to/perftest-platform/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Increase timeouts for long-running requests
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Logs
    access_log /var/log/nginx/llm-perf-platform-access.log;
    error_log /var/log/nginx/llm-perf-platform-error.log;
}
```

启用站点：
```bash
sudo ln -s /etc/nginx/sites-available/llm-perf-platform /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 服务管理

### 后端服务
```bash
# 启动服务
sudo systemctl start llm-perf-backend

# 停止服务
sudo systemctl stop llm-perf-backend

# 重启服务
sudo systemctl restart llm-perf-backend

# 查看状态
sudo systemctl status llm-perf-backend

# 查看日志
sudo journalctl -u llm-perf-backend -f

# 或查看文件日志
tail -f llm-perf-platform/logs/backend.log
tail -f llm-perf-platform/logs/backend-error.log
```

### Nginx
```bash
# 测试配置
sudo nginx -t

# 重载配置
sudo systemctl reload nginx

# 重启服务
sudo systemctl restart nginx

# 查看日志
sudo tail -f /var/log/nginx/llm-perf-platform-access.log
sudo tail -f /var/log/nginx/llm-perf-platform-error.log
```

## 环境变量

### 后端环境变量

在 `llm-perf-platform/.env` 文件中配置：

```bash
# 数据库
DATABASE_URL=sqlite:///./llm_perf_platform.db

# 日志目录
LLM_PERF_LOG_DIR=./logs

# Appauto 路径（可选，部署时可通过环境变量或部署脚本参数指定）
APPAUTO_PATH=/path/to/appauto

# API 配置
API_HOST=0.0.0.0
API_PORT=8000

# 默认管理员账号
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=admin123

# 任务调度器
TASK_SCHEDULER_MAX_WORKERS=5
```

### 前端环境变量

在 `frontend/.env` 文件中配置（可选）：

```bash
# API Base URL
# 开发环境：可以设置为后端 API 地址（如 http://localhost:8000/api）
# 生产环境：使用相对路径 /api（由 Nginx 反向代理处理）
# 默认值：/api
VITE_API_BASE=/api
```

**注意**：
- 前端默认使用相对路径 `/api`，适用于生产环境（Nginx 部署）
- 开发环境下 Vite 会自动代理 `/api` 到 `http://localhost:8000`
- 无需修改环境变量，除非有特殊需求

## 数据库迁移

```bash
cd llm-perf-platform
source .venv/bin/activate

# 查看当前版本
alembic current

# 升级到最新版本
alembic upgrade head

# 回滚一个版本
alembic downgrade -1

# 查看迁移历史
alembic history
```

## 故障排查

### 后端无法启动
1. 检查 Python 版本：`python3.11 --version`
2. 检查虚拟环境：`source .venv/bin/activate`
3. 检查依赖：`pip list`
4. 查看日志：`tail -f logs/backend-error.log`

### Appauto 依赖问题
1. 检查 appauto 路径是否正确：`ls -la /path/to/appauto`
2. 检查 `pyproject.toml` 中的 appauto 路径：`grep appauto pyproject.toml`
3. 重新运行部署脚本并指定正确路径：`APPAUTO_PATH=/correct/path ./deploy.sh`
4. 手动更新 pyproject.toml 中的路径后重新安装：`pip install -e .`

### 前端构建失败
1. 检查 Node.js 版本：`node --version` (需要 >= 18)
2. 清理缓存：`rm -rf node_modules package-lock.json && npm install`
3. 检查构建日志

### 前端 API 请求失败
1. 检查浏览器控制台网络请求
2. 生产环境：确认 Nginx 配置正确并已重启
3. 开发环境：确认后端在 `http://localhost:8000` 运行
4. 检查 CORS 配置（如果跨域请求）

### 数据库问题
1. 检查数据库文件权限
2. 运行数据库迁移：`alembic upgrade head`
3. 如需重置：删除 `llm_perf_platform.db` 后重新运行迁移

### Nginx 502 错误
1. 检查后端服务是否运行：`sudo systemctl status llm-perf-backend`
2. 检查端口是否正确：`netstat -tuln | grep 8000`
3. 查看 Nginx 错误日志：`sudo tail -f /var/log/nginx/error.log`

## 开发指南

### 添加新的 API 端点
1. 在 `llm_perf_platform/api/` 下创建或修改路由文件
2. 在 `llm_perf_platform/api/router.py` 中注册路由
3. 添加相应的类型定义到 `frontend/src/types.ts`
4. 在 `frontend/src/api.ts` 中添加 API 客户端函数

### 数据库模型修改
1. 修改 `llm_perf_platform/models/` 下的模型
2. 创建迁移：`alembic revision --autogenerate -m "描述"`
3. 应用迁移：`alembic upgrade head`

### 前端组件开发
- 主应用：`frontend/src/App.tsx`
- 样式：`frontend/src/styles.css`
- 类型定义：`frontend/src/types.ts`
- API 客户端：`frontend/src/api.ts`

## 安全建议

1. **修改默认管理员密码**：首次登录后立即修改
2. **使用 HTTPS**：生产环境务必配置 SSL 证书
3. **配置防火墙**：只开放必要的端口（80, 443）
4. **定期备份**：备份数据库文件和结果文件
5. **更新依赖**：定期更新系统和应用依赖

## 许可证

[指定你的许可证]

## 贡献

欢迎提交 Issue 和 Pull Request！

## 支持

如有问题，请提交 Issue 或联系维护团队。
