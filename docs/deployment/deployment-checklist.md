# Ubuntu 22.04 LTS 部署检查清单

本文档提供了在 Ubuntu 22.04 LTS 上部署测试平台的完整检查清单。

> 💡 **提示**: 推荐使用 `one-click-deploy.sh` 脚本进行自动化部署，详见 [快速部署指南](quick-deploy.md)。

## 部署前准备

### 1. 服务器要求
- [ ] Ubuntu 22.04 LTS (或兼容系统)
- [ ] 至少 2GB RAM
- [ ] 至少 10GB 可用磁盘空间
- [ ] sudo 权限

### 2. 代码准备
- [ ] 已克隆 perftest-platform 代码仓库
- [ ] 已克隆或准备好 appauto 代码（在同一服务器上）
- [ ] 记录 appauto 的绝对路径：`___________________`

### 3. 网络要求
- [ ] 服务器可访问外网（用于下载依赖）
- [ ] 开放端口 80 (HTTP) 或/和 443 (HTTPS)
- [ ] （可选）配置域名指向服务器 IP

## 部署步骤

### 步骤 1: 系统依赖安装

```bash
# 更新系统包
sudo apt-get update

# 检查是否有 apt-get 命令
which apt-get
```

- [ ] apt-get 命令可用
- [ ] 系统包索引已更新

### 步骤 2: 运行部署脚本

```bash
cd /path/to/perftest-platform

# 方法 1: 默认路径（appauto 在 ../appauto）
chmod +x deploy.sh
./deploy.sh

# 方法 2: 指定 appauto 路径
APPAUTO_PATH=/path/to/appauto ./deploy.sh
```

**检查项**：
- [ ] 脚本开始执行
- [ ] 系统依赖安装成功
  - [ ] Python 3.11 安装成功
  - [ ] Node.js (>= 18) 安装成功
  - [ ] Nginx 安装成功
  - [ ] SQLite3 安装成功
- [ ] Appauto 路径检测成功
- [ ] Python 虚拟环境创建成功
- [ ] Python 依赖安装成功（包括 appauto）
- [ ] 数据库初始化成功
- [ ] 前端依赖安装成功
- [ ] 前端构建成功

**常见问题**：
- 如果 appauto 路径错误，脚本会提示并允许继续或退出
- 如果 Python 依赖安装失败，检查 pyproject.toml 中的 appauto 路径
- 如果前端构建失败，检查 Node.js 版本 (node --version)

### 步骤 3: 配置环境变量（可选）

```bash
cd llm-perf-platform

# 复制环境变量模板
cp .env.example .env

# 编辑配置
vi .env
```

**需要修改的配置**：
- [ ] APPAUTO_PATH (如果与实际路径不同)
- [ ] DEFAULT_ADMIN_EMAIL (建议修改)
- [ ] DEFAULT_ADMIN_PASSWORD (建议修改)

### 步骤 4: 设置 systemd 服务

```bash
cd /path/to/perftest-platform
chmod +x setup-services.sh
sudo ./setup-services.sh
```

**检查项**：
- [ ] systemd 服务文件已创建 (`/etc/systemd/system/llm-perf-backend.service`)
- [ ] 服务已启用 (enabled)
- [ ] 服务已启动并运行
- [ ] 日志文件已创建（检查 `logs/backend.log` 和 `logs/backend-error.log`）

**验证服务状态**：
```bash
sudo systemctl status llm-perf-backend
```
- [ ] 状态显示 "active (running)"
- [ ] 没有错误信息

**查看日志**：
```bash
# 查看实时日志
sudo journalctl -u llm-perf-backend -f

# 或查看文件日志
tail -f llm-perf-platform/logs/backend.log
```

### 步骤 5: 配置 Nginx

```bash
cd /path/to/perftest-platform
chmod +x setup-nginx.sh
sudo ./setup-nginx.sh
```

**可选配置**：
- 设置域名：`sudo DOMAIN=your-domain.com ./setup-nginx.sh`
- 启用 SSL：`sudo SSL_ENABLED=true DOMAIN=your-domain.com ./setup-nginx.sh`

**检查项**：
- [ ] Nginx 配置文件已创建 (`/etc/nginx/sites-available/llm-perf-platform`)
- [ ] 配置已启用 (软链接到 sites-enabled)
- [ ] Nginx 配置测试通过 (`nginx -t`)
- [ ] Nginx 已重载配置

**验证 Nginx**：
```bash
# 测试配置
sudo nginx -t

# 检查服务状态
sudo systemctl status nginx

# 查看错误日志
sudo tail -f /var/log/nginx/llm-perf-platform-error.log
```

## 部署后验证

### 1. 后端 API 测试

```bash
# 测试健康检查端点
curl http://localhost/api/health
# 或
curl http://localhost:8000/api/health

# 预期响应: {"status": "healthy"}
```

- [ ] 后端 API 响应正常

### 2. 前端访问测试

在浏览器中访问：
- HTTP: `http://your-server-ip` 或 `http://your-domain.com`
- HTTPS: `https://your-domain.com` (如果配置了 SSL)

**检查项**：
- [ ] 前端页面加载成功
- [ ] 可以看到登录界面
- [ ] 浏览器控制台无 404 或 CORS 错误
- [ ] 可以成功登录（使用默认管理员账号）

### 3. 完整功能测试

使用默认管理员账号登录：
- 邮箱: `admin@example.com`
- 密码: `admin123`

**测试功能**：
- [ ] 登录成功
- [ ] 可以访问测试列表
- [ ] 可以创建新测试任务
- [ ] 可以查看系统管理
- [ ] API 请求正常（检查浏览器 Network 标签）

## 故障排查

### 后端服务无法启动

```bash
# 查看服务状态
sudo systemctl status llm-perf-backend

# 查看详细日志
sudo journalctl -u llm-perf-backend -n 50

# 查看错误日志
cat llm-perf-platform/logs/backend-error.log
```

**常见原因**：
- [ ] Python 依赖未正确安装（检查 appauto 路径）
- [ ] 数据库文件权限问题
- [ ] 端口 8000 被占用

### Nginx 502 错误

```bash
# 检查后端服务
sudo systemctl status llm-perf-backend

# 检查端口监听
sudo netstat -tuln | grep 8000

# 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/llm-perf-platform-error.log
```

**常见原因**：
- [ ] 后端服务未运行
- [ ] 防火墙阻止本地连接
- [ ] Nginx 配置错误

### 前端 API 请求失败

打开浏览器开发者工具 (F12)，检查 Network 标签：

**检查项**：
- [ ] API 请求路径正确（应为 `/api/...`）
- [ ] 没有 CORS 错误
- [ ] 没有 404 错误
- [ ] 响应状态码正常（200, 401 等）

**常见原因**：
- [ ] 前端 API 地址配置错误（应已修复为 `/api`）
- [ ] Nginx 反向代理配置错误
- [ ] 后端服务未运行

### Appauto 依赖问题

```bash
# 检查 appauto 路径
ls -la /path/to/appauto

# 检查 pyproject.toml 配置
cd llm-perf-platform
grep appauto pyproject.toml

# 检查虚拟环境中的 appauto
source .venv/bin/activate
pip show appauto
```

**修复方法**：
1. 确认 appauto 路径正确
2. 更新 pyproject.toml 中的路径
3. 重新安装依赖：`pip install -e .`
4. 重启后端服务：`sudo systemctl restart llm-perf-backend`

## 安全加固（生产环境）

- [ ] 修改默认管理员密码
- [ ] 配置 SSL 证书（Let's Encrypt 或自签名）
- [ ] 配置防火墙规则
  ```bash
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw enable
  ```
- [ ] 设置定期备份
  - 数据库文件：`llm_perf_platform.db`
  - 测试结果：`results/` 目录
- [ ] 更新系统包
  ```bash
  sudo apt-get update && sudo apt-get upgrade
  ```

## 维护命令

### 服务管理

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
```

### 更新部署

```bash
# 1. 拉取最新代码
cd /path/to/perftest-platform
git pull

# 2. 更新后端依赖
cd llm-perf-platform
source .venv/bin/activate
pip install -e .

# 3. 运行数据库迁移
alembic upgrade head

# 4. 重启后端服务
sudo systemctl restart llm-perf-backend

# 5. 更新前端
cd ../frontend
pnpm install
pnpm build

# 6. 重载 Nginx
sudo systemctl reload nginx
```

## 部署完成确认

所有检查项通过后，部署完成！

- [ ] 后端服务正常运行
- [ ] 前端可以正常访问
- [ ] API 请求正常工作
- [ ] 可以成功登录和使用所有功能
- [ ] 日志记录正常
- [ ] 已完成安全加固（生产环境）

---

**部署日期**: ___________________
**部署人员**: ___________________
**服务器 IP**: ___________________
**域名**: ___________________
**备注**: ___________________
