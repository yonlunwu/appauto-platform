# 快速部署指南

使用一键部署脚本快速将 LLM Performance Test Platform 部署到 Ubuntu 22.04 LTS。

## 前置要求

1. **Ubuntu 22.04 LTS** 服务器（或兼容的 Debian 系统）
2. **sudo 权限**
3. **appauto 代码** 已在服务器上（记录其路径）

## 一键部署

### 步骤 1: 获取代码

```bash
# SSH 登录到 Ubuntu 服务器后执行

# 克隆项目代码
git clone <repository-url>
cd perftest-platform
```

### 步骤 2: 执行部署

```bash
# 一条命令完成部署（将 /path/to/appauto 替换为实际路径）
sudo ./one-click-deploy.sh --appauto-path /path/to/appauto
```

脚本会提示确认配置信息，输入 `y` 继续。

### 步骤 3: 等待完成

部署过程大约需要 5-10 分钟，脚本会自动：
- 安装系统依赖
- 配置 Python 和 Node.js 环境
- 安装项目依赖
- 初始化数据库
- 构建前端
- 配置并启动服务
- 配置 Nginx

### 步骤 4: 访问应用

部署成功后，在浏览器访问：
```
http://your-server-ip
```

使用默认管理员账号登录：
- 邮箱: `admin@example.com`
- 密码: `admin123`

⚠️ **重要**: 登录后立即修改密码！

## 高级选项

### 使用自定义域名

```bash
sudo ./one-click-deploy.sh --appauto-path /opt/appauto --domain example.com
```

### 启用 HTTPS

需要先准备 SSL 证书：
- 证书文件: `/etc/ssl/certs/llm-perf-platform.crt`
- 私钥文件: `/etc/ssl/private/llm-perf-platform.key`

```bash
sudo ./one-click-deploy.sh --appauto-path /opt/appauto \
    --domain example.com \
    --ssl
```

生成自签名证书（仅用于测试）：
```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/llm-perf-platform.key \
    -out /etc/ssl/certs/llm-perf-platform.crt
```

### 自定义后端端口

```bash
sudo ./one-click-deploy.sh --appauto-path /opt/appauto --backend-port 9000
```

### 查看所有选项

```bash
./one-click-deploy.sh --help
```

## 常见问题

### 1. 部署失败：appauto 路径不存在

**错误信息**: `Appauto directory not found`

**解决方法**:
```bash
# 检查 appauto 是否存在
ls -la /path/to/appauto

# 如果不存在，先克隆 appauto
git clone <appauto-repository-url> /opt/appauto

# 然后重新部署
sudo ./one-click-deploy.sh --appauto-path /opt/appauto
```

### 2. 权限问题

**错误信息**: `Please run as root`

**解决方法**: 使用 sudo 运行脚本
```bash
sudo ./one-click-deploy.sh --appauto-path /opt/appauto
```

### 3. 端口被占用

**错误信息**: Backend service failed to start

**解决方法**: 检查端口占用并更换端口
```bash
# 检查 8000 端口是否被占用
sudo netstat -tuln | grep 8000

# 使用其他端口部署
sudo ./one-click-deploy.sh --appauto-path /opt/appauto --backend-port 9000
```

### 4. Node.js 版本过低

脚本会自动升级 Node.js 到最新 LTS 版本。如果遇到问题：

```bash
# 手动升级 Node.js
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo bash -
sudo apt-get install -y nodejs

# 验证版本
node --version  # 应该 >= 18
```

### 5. Nginx 配置失败

**解决方法**: 检查 Nginx 配置
```bash
# 测试配置
sudo nginx -t

# 查看错误日志
sudo tail -f /var/log/nginx/error.log

# 重新配置
sudo ./setup-nginx.sh
```

## 服务管理

### 查看服务状态

```bash
sudo systemctl status llm-perf-backend
```

### 重启服务

```bash
sudo systemctl restart llm-perf-backend
```

### 查看日志

```bash
# 实时日志
sudo journalctl -u llm-perf-backend -f

# 或查看文件日志
tail -f llm-perf-platform/logs/backend.log
tail -f llm-perf-platform/logs/backend-error.log
```

### 停止服务

```bash
sudo systemctl stop llm-perf-backend
```

## 验证部署

### 1. 检查后端 API

```bash
curl http://localhost/api/health
# 预期输出: {"status":"healthy"}
```

### 2. 检查前端

在浏览器中访问服务器 IP，应该能看到登录页面。

### 3. 检查日志

```bash
# 查看后端日志，应该没有 ERROR
tail -n 50 llm-perf-platform/logs/backend.log

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/llm-perf-platform-access.log
```

## 更新部署

重新部署更新后的代码：

```bash
# 1. 拉取最新代码
cd /path/to/perftest-platform
git pull

# 2. 重新运行部署脚本
sudo ./one-click-deploy.sh --appauto-path /path/to/appauto

# 服务会自动重启
```

## 卸载

如果需要完全移除：

```bash
# 停止并禁用服务
sudo systemctl stop llm-perf-backend
sudo systemctl disable llm-perf-backend
sudo rm /etc/systemd/system/llm-perf-backend.service
sudo systemctl daemon-reload

# 移除 Nginx 配置
sudo rm /etc/nginx/sites-enabled/llm-perf-platform
sudo rm /etc/nginx/sites-available/llm-perf-platform
sudo systemctl reload nginx

# 删除项目文件
rm -rf /path/to/perftest-platform
```

## 需要帮助？

1. 查看详细文档: `README.md`
2. 查看部署检查清单: `DEPLOYMENT_CHECKLIST.md`
3. 提交 Issue 到项目仓库

---

**部署愉快！** 🚀
