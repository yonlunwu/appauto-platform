# 数据库迁移说明

本项目使用 Alembic 进行数据库 schema 迁移管理。

## 为什么需要数据库迁移？

数据库迁移允许我们：
- 跟踪数据库 schema 的变更历史
- 在不丢失数据的情况下修改表结构
- 在团队成员之间同步数据库变更
- 支持数据库版本回滚

## 常用命令

### 1. 创建新的迁移

当你修改了模型（添加/删除/修改字段）后，运行：

```bash
uv run alembic revision --autogenerate -m "描述你的变更"
```

这会在 `alembic/versions/` 目录下生成一个新的迁移文件。

### 2. 查看迁移状态

查看当前数据库的迁移状态：

```bash
uv run alembic current
```

查看迁移历史：

```bash
uv run alembic history
```

### 3. 应用迁移

将数据库升级到最新版本：

```bash
uv run alembic upgrade head
```

升级到特定版本：

```bash
uv run alembic upgrade <revision_id>
```

### 4. 回滚迁移

回滚一个版本：

```bash
uv run alembic downgrade -1
```

回滚到特定版本：

```bash
uv run alembic downgrade <revision_id>
```

完全回滚到初始状态：

```bash
uv run alembic downgrade base
```

## 工作流程示例

### 场景：添加新字段到 TaskRecord

1. **修改模型**

   在 `llm_perf_platform/models/task_record.py` 中添加新字段：

   ```python
   class TaskRecord(SQLModel, table=True):
       # 现有字段...
       new_field: Optional[str] = Field(default=None)
   ```

2. **生成迁移**

   ```bash
   uv run alembic revision --autogenerate -m "Add new_field to TaskRecord"
   ```

3. **检查生成的迁移文件**

   打开 `alembic/versions/xxxx_add_new_field_to_taskrecord.py`，确认迁移操作正确。

4. **应用迁移**

   ```bash
   uv run alembic upgrade head
   ```

5. **验证**

   启动应用，确认新字段工作正常。

### 场景：修改现有字段类型

这种情况下自动生成的迁移可能需要手动调整，特别是需要数据转换时。

1. 修改模型
2. 生成迁移: `uv run alembic revision --autogenerate -m "Change field type"`
3. **手动编辑迁移文件**，添加数据转换逻辑
4. 应用迁移

## 注意事项

### SQLite 限制

SQLite 不支持某些 ALTER TABLE 操作（如修改列类型、删除列等）。在这种情况下，Alembic 会使用"批量操作"模式：

- 创建新表
- 复制数据
- 删除旧表
- 重命名新表

这个过程是自动的，但在生产环境中要特别小心。

### 测试迁移

在应用到生产环境前，务必：

1. 在开发环境测试迁移
2. 备份生产数据库
3. 在测试环境用生产数据副本测试迁移

### 团队协作

- 提交迁移文件到版本控制
- 拉取代码后记得运行 `uv run alembic upgrade head`
- 避免多人同时修改数据库schema导致冲突

## 配置文件

- `alembic.ini`: Alembic 主配置文件
- `alembic/env.py`: 环境配置，包含数据库连接和模型导入
- `alembic/versions/`: 存放所有迁移文件

## 当前状态

当前数据库已初始化，包含以下表：
- `taskrecord`: 任务记录表（包含 user_id 字段）
- `useraccount`: 用户账户表
- `modelinstance`: 模型实例表

初始迁移已应用（revision: 3123e7766f8a）
