# 大模型性能测试平台（基于 evalscope）设计思路文档
## 1. 总体目标
构建一个 WebUI 驱动的大模型性能测试平台，基于 evalscope 实现大模型性能评估，覆盖输入输出长度控制、并发压力测试、循环测试、warmup 预热、结果归档等能力。

系统目标包括： 

+ WebUI 参数配置与触发测试
+ 后端异步执行 evalscope 压测任务
+ 每次测试生成独立 Excel 报告
+ 支持结果查看、归档、删除
+ 具备良好的任务隔离与可追溯性

---

## 2. 功能设计
### 2.1 执行测试
用户可在 UI 中配置以下参数：

+ **输入长度（input_length）**
+ **输出长度（output_length）**
+ **并发数（并发自动探测最大可用并发）**
+ **loop（测试轮数）**
+ **是否 warmup（预热）**

后端行为：

+ 若开启 warmup，则先执行固定次数的 evalscope 请求用于模型升温；
+ 根据用户配置或自动探测的最大并发执行 main test；
+ 将结果收集并写入 Excel

---

### 2.2 并发上限自动探测
系统在用户点击"自动计算最大并发"时执行： 

1. 通过小批量请求测延迟 
2. 根据 GPU/MPS/NPU 后端特性估算最大并发
3. 可进一步通过二分探测最佳并发

---

### 2.3 结果收集（Excel）
每轮测试完成后生成一份 Excel 文件，内容包括：

+ 参数配置
+ 所有请求耗时
+ 吞吐量、P50/P90/P95/P99 latency
+ token/s
+ 错误率

完整的结果数据表，文件格式示例：

```plain
result_{model}_{timestamp}.xlsx
```

---

### 2.4 结果归档
用户可从 WebUI 点击"归档"，系统会将 Excel 移动到：

```plain
archives/
 └── engine/
      └── model/
           └── timestamp/
                └── result.xlsx
```

支持删除/取消归档等操作。

---

### 2.5 历史测试查看
列表页展示历史执行记录：

+ 时间
+ 模型
+ 参数
+ 状态（成功/失败）
+ 下载结果
+ 归档 / 删除按钮

---

## 3. 系统架构设计
### 3.1 整体架构
```plain
前端（Vue/React）
   |
FastAPI 网关
   |
任务队列（Celery / 后台线程）
   |
执行器（evalscope 调用）
   |
文件系统（Excel 存储）
   |
归档目录
```

### 3.2 模块划分
+ **frontend**：WebUI，参数输入、结果展示
+ **api**：FastAPI 接口层
+ **task**：异步任务管理（Celery 或线程池）
+ **executor**：evalscope 调用封装
+ **storage**：Excel 文件存储与归档
+ **db**：测试记录持久化（SQLite/Postgres）

---

## 4. API 设计（示例）
### POST /tests/run
发起压测任务

### GET /tests/list
获取历史任务列表

### GET /tests/{id}
查看任务详情

### POST /tests/archive
归档某任务结果

### DELETE /tests/{id}
删除任务

---

## 5. 文件存储设计
### 5.1 运行输出
```plain
results/
 └── result_20250101_120000.xlsx
```

### 5.2 归档输出
```plain
archives/
 └── vllm/qwen2.5/20250101_120000/result.xlsx
```

---

## 6. 后端任务执行流程
1. 接收用户参数
2. 若需要 warmup：执行 evalscope warmup
3. 执行 loop 测试
4. 收集数据并生成 Excel
5. 保存任务记录到 DB
6. 返回结果文件路径

---

## 7. 并发探测逻辑
+ 基于请求延迟估计
+ 或二分压力探测
+ 避免 GPU OOM
+ 提供明确失败提示

---

## 8. 扩展能力（预留）
+ 支持流式（stream）压测
+ 支持多模型批量测试
+ 结果可视化（响应时间图、token/s 图）
+ 使用对象存储（S3）管理归档文件
+ 性能对比功能（A/B Testing）

---

## 9. 项目落地风险评估
+ evalscope 报错 → 加重试/timeout
+ excel 过大 → 可拆片或改成 csv
+ 高并发任务 → 使用 Celery 进行隔离

总体风险可控。

---

# 10. 总结
本设计方案可在 3-7 天搭建出一个成熟可靠的大模型性能测试平台，并方便未来扩展。结构清晰、风险低、技术路径清楚。

---

# 11. 迭代状态追踪

| 阶段 | 说明 | 状态 | 更新时间 |
| --- | --- | --- | --- |
| 1-3 | FastAPI 骨架、TaskRecord、`/tests/run` 基础 API | ✅ 已完成 | 2025-11-28 |
| 4-5 | 线程池调度 & 模拟 evalscope 执行器 | ✅ 已完成 | 2025-11-28 |
| 6-9 | warmup/loop/并发、Excel、归档/删除 | ✅ 已完成 | 2025-11-28 |
| 10 | React WebUI（表单、列表、归档/删除） | ✅ 已完成 | 2025-11-28 |
| 11 | `pytest + httpx` 后端集成测试 | ✅ 已完成 | 2025-11-28 |
| **12** | **真实 evalscope + 远程执行 + 指标对齐** | ✅ **已完成** | **2025-11-28** |
| 13 | 部署 & 可观测 | ⏸ 暂缓 | - |
| 14 | 注册/登录/权限控制 | 🟡 部分完成（40%）| 2025-11-28 |

**阶段 12 详细完成情况**：
- ✅ SSH 远程连接（密钥/密码认证）
- ✅ Evalscope 命令构建和执行
- ✅ 三种执行模式（远程/本地/模拟）
- ✅ 硬件感知并发探测（GPU 显存）
- ✅ 真实指标解析和对齐
- ✅ 前端 SSH 配置界面
- ✅ 完整测试覆盖

**当前总体完成度**: ~85% (核心功能完成)

**详细进度追踪文档**: 请查看 `PROGRESS.md`

---

# 基于上述设计建议的迭代实施计划（一次只做一个小模块）
以下按开发顺序划分为 **非常小的模块**，每一步都可独立完成、测试、提交。

# 基于上述设计建议的迭代实施计划（一次只做一个小模块）
以下按开发顺序划分为 **非常小的模块**，每一步都可独立完成、测试、提交。

---

## **阶段 1：后端基础框架搭建**
### ① FastAPI 项目骨架（最小可运行）
+ `app/main.py`
+ `app/api`
+ `app/models`
+ `app/services`
+ `app/tasks`
+ `app/storage`

✔ 输出：项目可启动

---

## **阶段 2：核心数据结构**
### ② 定义压测任务的数据模型（TaskRecord）
字段：

+ task_id
+ model
+ engine
+ parameters（input/output/loop/concurrency 等）
+ status
+ created_at
+ result_path
+ archived_path

✔ 输出：SQLite + SQLModel / SQLAlchemy

---

## **阶段 3：基础 API**
### ③ 实现 `/tests/run` 接口（仅接收参数，先不执行任务）
✔ 输出：能收到 JSON → 返回 task_id

---

## **阶段 4：异步任务系统**
（可以选 Celery 或后台 async + ThreadPool，我推荐 Celery）

### ④ 建 Celery 基础结构（能执行 demo 任务）
✔ 输出：worker 能执行一个简单任务

---

## **阶段 5：evalscope 执行器（executor）**
### ⑤ 编写 evalscope 调用封装（先实现最小功能）
✔ 输出：可执行一次简单 evalscope 测试（不生成 excel）

---

## **阶段 6：核心测试功能**
依次实现：

### ⑥ warmup 逻辑
### ⑦ 主压测逻辑（loop、参数控制）
### ⑧ 并发探测逻辑（简单版本）
✔ 输出：能跑完整压测、返回结构化结果

---

## **阶段 7：结果文件**
### ⑨ 生成 Excel（minimal version）
✔ 输出：生成 Excel 文件

---

## **阶段 8：任务生命周期管理**
### ⑩ 查询任务列表 `/tests/list`
### ⑪ 查询任务详情 `/tests/{id}`
---

## **阶段 9：归档模块**
### ⑫ 实现 excel 文件归档（移动到 archives/xxx）
### ⑬ 实现 UI 可删除
---

## **阶段 10：前端页面**
（也是按小模块推进）

+ 测试表单页面
+ 任务列表页
+ 结果下载 & 归档页

---

## **阶段 11：自动化测试与质量**
### ⑭ FastAPI API 集成测试
+ 使用 `httpx`/`pytest` 覆盖 `/tests/run`、`/tests/list`、归档/删除等关键路径，附带 sqlite 临时库。

### ⑮ 执行器与并发探测单测
+ 针对 `EvalScopeRunner`、`ConcurrencyService` 进行参数化测试，验证 warmup/loop 与建议并发输出。

### ⑯ 前端关键路径测试
+ 通过 `vitest`/`testing-library` 或 Cypress 覆盖表单提交、任务轮询与归档按钮。

---

## **阶段 12：真实 evalscope 接入**
### ⑰ Evalscope Client + 远程执行器
+ 重构 `executor/runner.py`，通过 SSH（paramiko/asyncssh）到指定远程服务器运行 evalscope 命令。
+ 任务参数新增：`ssh_host`、`ssh_port`、`ssh_user`、`auth_type(密钥/密码)`、`private_key_path`/`password`，UI 与 DB 均需同步。
+ 支持 streaming、token 统计、错误重试，以及远程日志回传。

### ⑱ 并发探测增强
+ 结合远程节点硬件（GPU 型号、显存、并行度）执行采样 + 二分探测，失败时给出原因提示（OOM/超时/带宽）。

### ⑲ 结果指标对齐
+ 解析 evalscope 原生输出，填充 Excel summary/request sheet，确保 token/s、吞吐量、错误率与真实值一致。

---

## （可选）阶段 13：部署与可观测（当前暂缓）
+ 暂时不推进，可在未来需要时补充 Docker/运维/告警相关内容。

---

## **阶段 14：账号体系与权限控制**
### ⑳ 用户注册 / 登录
+ 提供注册、登录、登出接口，密码加盐哈希（bcrypt/argon2），签发 JWT 或 Session Token，UI 增加登录页。

### ㉑ 权限模型
+ 设计基础 RBAC（Admin/Member/Viewer），限制任务创建、归档/删除、SSH 凭证管理等能力；UI 按角色控制按钮展示。

### ㉒ 审计日志
+ 记录用户触发的关键事件（任务创建、归档、删除、下载），便于审计追踪。

---