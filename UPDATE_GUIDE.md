# 平台更新指南

## 自动更新脚本

使用 `update.sh` 可以快速更新平台到最新版本。

### 基本用法

```bash
# 检查是否有更新（不实际更新）
sudo ./update.sh --check

# 更新所有组件（后端+前端）
sudo ./update.sh

# 只更新后端
sudo ./update.sh --backend-only

# 只更新前端
sudo ./update.sh --frontend-only
```

### 更新流程

脚本会自动执行以下步骤：

1. **检查更新** - 对比本地和远程commit
2. **显示变更** - 展示将要应用的更新内容
3. **确认更新** - 等待用户确认（y/N）
4. **拉取代码** - git pull最新代码
5. **更新依赖** - 如果pyproject.toml或package.json有变化，自动更新依赖
6. **数据库迁移** - 运行alembic upgrade head
7. **重启服务** - 重启后端服务
8. **重新构建前端** - 如果前端代码有变化

### 安全特性

- ✅ **需要人工确认** - 不会自动应用更新，需要用户确认
- ✅ **显示变更内容** - 更新前显示具体改动
- ✅ **检查模式** - 可以先检查而不实际更新
- ✅ **详细日志** - 所有操作记录到 `logs/update.log`
- ✅ **服务状态检查** - 更新后验证服务是否正常启动

### 更新日志

所有更新操作都会记录到：
```
logs/update.log
```

可以查看历史更新记录：
```bash
tail -100 logs/update.log
```

### 回滚

如果更新后出现问题，可以回滚到之前的版本：

```bash
# 1. 查看commit历史
git log --oneline -10

# 2. 回滚到指定commit
git reset --hard <commit-hash>

# 3. 重启服务
sudo systemctl restart llm-perf-backend.service

# 4. 如果需要，重新构建前端
cd frontend
pnpm build
```

### 注意事项

⚠️ **更新前建议：**
- 在低峰期进行更新
- 提前备份数据库文件
- 检查是否有正在运行的测试任务
- 查看最新的commit说明，了解改动内容

⚠️ **不要：**
- 在有重要测试任务运行时更新
- 配置定时任务自动更新（避免引入未经验证的bug）
- 跳过确认步骤直接更新生产环境
