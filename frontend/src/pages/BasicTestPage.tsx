import React from "react";
import { CollapsiblePanel, TaskTable } from "../components";
import { TaskTableColumn, TaskTableAction, commonColumns, actionConditions, confirmMessages, batchConfirmMessages } from "../components/TaskTable";
import { TestRunForm, TaskSummary, Profile } from "../types";
import { API_BASE, getAuthToken } from "../api";
import { downloadUrl } from "../api";

interface BasicTestPageProps {
  expandedSection: string | null;
  togglePanel: (panelId: string) => void;

  // Form state
  form: TestRunForm;
  updateForm: <K extends keyof TestRunForm>(key: K, value: TestRunForm[K]) => void;
  validationErrors: Set<string>;
  setValidationErrors: (errors: Set<string>) => void;

  // Appauto branches
  appautoBranches: string[];
  loadingBranches: boolean;

  // Password visibility
  showPassword: { ssh: boolean; sudo: boolean };
  setShowPassword: React.Dispatch<React.SetStateAction<{ ssh: boolean; sudo: boolean }>>;

  // Loading and messages
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string;
  setError: (error: string) => void;
  message: string;
  setMessage: (message: string) => void;

  // Tasks
  tasks: TaskSummary[];
  loadTasks: () => Promise<void>;
  profile: Profile | null;

  // Task actions
  handlePreview: (taskId: number) => void;
  handleArchive: (taskId: number) => Promise<void>;
  handleViewLogs: (taskId: number) => void;
  handleRetry: (taskId: number) => Promise<void>;
  handleCancel: (taskId: number) => Promise<void>;
  handleDelete: (taskId: number) => Promise<void>;
}

export const BasicTestPage: React.FC<BasicTestPageProps> = ({
  expandedSection,
  togglePanel,
  form,
  updateForm,
  validationErrors,
  setValidationErrors,
  appautoBranches,
  loadingBranches,
  showPassword,
  setShowPassword,
  loading,
  setLoading,
  error,
  setError,
  message,
  setMessage,
  tasks,
  loadTasks,
  profile,
  handlePreview,
  handleArchive,
  handleViewLogs,
  handleRetry,
  handleCancel,
  handleDelete,
}) => {
  return (
    <div>
      <CollapsiblePanel
        id="basic-test"
        title="基础测试 (Pytest)"
        icon="🧪"
        isExpanded={expandedSection === "basic-test"}
        onToggle={togglePanel}
      >
            {/* 场景选择 */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ fontWeight: "600", marginBottom: "0.5rem", display: "block" }}>
                测试场景
              </label>
              <div style={{ display: "flex", gap: "2rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="radio"
                    name="basic-scenario"
                    value="ft"
                    checked={form.scenario === "ft"}
                    onChange={(e) => updateForm("scenario", e.target.value as "ft" | "amaas")}
                  />
                  <span>基于 FT</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="radio"
                    name="basic-scenario"
                    value="amaas"
                    checked={form.scenario === "amaas"}
                    onChange={(e) => updateForm("scenario", e.target.value as "ft" | "amaas")}
                  />
                  <span>基于 AMaaS</span>
                </label>
              </div>
            </div>

            {/* Appauto 配置 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>Appauto 配置</h3>
            <div className="form-grid">
              <label>
                Appauto 分支 *
                <input
                  type="text"
                  list="appauto-branch-suggestions-basic"
                  value={form.appauto_branch || ""}
                  onChange={(e) => {
                    updateForm("appauto_branch", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("appauto_branch");
                        return next;
                      });
                    } else {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.add("appauto_branch");
                        return next;
                      });
                    }
                  }}
                  disabled={loadingBranches}
                  placeholder={loadingBranches ? "加载分支中..." : appautoBranches.length > 0 ? "从可用分支中选择或输入" : "main"}
                  required
                  style={{
                    borderColor: validationErrors.has("appauto_branch") ? "#f87171" : undefined,
                  }}
                />
                <datalist id="appauto-branch-suggestions-basic">
                  {appautoBranches.map((branch) => (
                    <option key={branch} value={branch} />
                  ))}
                </datalist>
                <small style={{ color: "#666" }}>指定 appauto 的 git 分支版本</small>
              </label>
            </div>

            {/* SSH 配置 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>SSH 配置</h3>
            <div className="form-grid">
              <label>
                SSH 主机 *
                <input
                  type="text"
                  value={form.amaas_ip || ""}
                  onChange={(e) => updateForm("amaas_ip", e.target.value)}
                  placeholder="例如: 192.168.1.100"
                  required
                />
              </label>

              <label>
                SSH 用户 *
                <input
                  type="text"
                  value={form.ssh_user || ""}
                  onChange={(e) => updateForm("ssh_user", e.target.value)}
                  placeholder="SSH 登录用户名"
                  required
                />
              </label>

              <label>
                SSH 密码
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input
                    type={showPassword.ssh ? "text" : "password"}
                    value={form.ssh_password || ""}
                    onChange={(e) => updateForm("ssh_password", e.target.value)}
                    placeholder="SSH 密码"
                    style={{ flex: 1, paddingRight: "2.5rem" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => ({ ...prev, ssh: !prev.ssh }))}
                    style={{
                      position: "absolute",
                      right: "0.5rem",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "0.25rem",
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                    }}
                    title={showPassword.ssh ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword.ssh ? "隐藏" : "显示"}
                  </button>
                </div>
              </label>

              <label>
                SSH 端口
                <input
                  type="number"
                  value={form.ssh_port === undefined ? "" : form.ssh_port}
                  onChange={(e) => updateForm("ssh_port", e.target.value === "" ? undefined : parseInt(e.target.value))}
                  placeholder="默认: 22"
                />
              </label>
            </div>

            {/* 测试配置 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>测试配置</h3>
            <div className="form-grid">
              <label>
                测试路径
                <input
                  type="text"
                  value={form.testpaths || ""}
                  onChange={(e) => updateForm("testpaths", e.target.value)}
                  placeholder={`默认: testcases/sanity_check/${form.scenario}/test_${form.scenario}.py`}
                />
                <small style={{ color: "#666" }}>不填则根据场景自动选择</small>
              </label>

              <label>
                测试级别
                <input
                  type="text"
                  value={form.case_level || ""}
                  onChange={(e) => updateForm("case_level", e.target.value)}
                  placeholder={`例如: ${form.scenario}_ci_sanity_check`}
                />
              </label>

              <label>
                模型优先级
                <input
                  type="text"
                  value={form.model_priority || ""}
                  onChange={(e) => updateForm("model_priority", e.target.value)}
                  placeholder='例如: ["P0", "P1", "P2"]'
                />
                <small style={{ color: "#666" }}>JSON数组格式</small>
              </label>

              {form.scenario === "ft" && (
                <label>
                  FT 端口
                  <input
                    type="number"
                    value={form.ft_port === undefined ? "" : form.ft_port}
                    onChange={(e) => updateForm("ft_port", e.target.value === "" ? undefined : parseInt(e.target.value))}
                    placeholder="默认: 35000"
                  />
                </label>
              )}

              <label>
                需要空闲GPU数
                <input
                  type="number"
                  value={form.need_empty_gpu_count === undefined ? "" : form.need_empty_gpu_count}
                  onChange={(e) => updateForm("need_empty_gpu_count", e.target.value === "" ? undefined : parseInt(e.target.value))}
                  placeholder="例如: 0"
                />
              </label>

              <label>
                TP 配置
                <input
                  type="text"
                  value={form.tp || ""}
                  onChange={(e) => updateForm("tp", e.target.value)}
                  placeholder='例如: [1, 2, 4, 8]'
                />
                <small style={{ color: "#666" }}>JSON数组格式</small>
              </label>
            </div>

            {/* 通知配置（可选） */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>通知配置（可选）</h3>
            <div className="form-grid">
              <label>
                飞书用户
                <input
                  type="text"
                  value={form.lark_user || ""}
                  onChange={(e) => updateForm("lark_user", e.target.value)}
                  placeholder="飞书用户名"
                />
              </label>

              <label>
                主题
                <input
                  type="text"
                  value={form.topic || ""}
                  onChange={(e) => updateForm("topic", e.target.value)}
                  placeholder="测试主题"
                />
              </label>

              <label>
                通知组
                <input
                  type="text"
                  value={form.notify_group || ""}
                  onChange={(e) => updateForm("notify_group", e.target.value)}
                  placeholder="例如: oc_e005f4612602e5af93d6272c0e8a1355"
                />
              </label>
            </div>

            {/* 报告配置（可选） */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>报告配置（可选）</h3>
            <div className="form-grid">
              <label>
                报告服务器
                <input
                  type="text"
                  value={form.report_server || ""}
                  onChange={(e) => updateForm("report_server", e.target.value)}
                  placeholder="例如: 192.168.110.11:9080"
                />
              </label>

              <label>
                报告 URL
                <input
                  type="text"
                  value={form.report_url || ""}
                  onChange={(e) => updateForm("report_url", e.target.value)}
                  placeholder="例如: job/my-job/123/allure/"
                />
              </label>
            </div>

            {/* 额外参数（可选） */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>额外参数（可选）</h3>
            <div className="form-grid">
              <label>
                Pytest 参数
                <input
                  type="text"
                  value={form.pytest_args || ""}
                  onChange={(e) => updateForm("pytest_args", e.target.value)}
                  placeholder="例如: -v -s --maxfail=1"
                />
                <small style={{ color: "#666" }}>额外的 pytest 命令行参数，空格分隔</small>
              </label>
            </div>

            {/* 操作按钮 */}
            <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
              <button
                onClick={async () => {
                  const errors: string[] = [];
                  if (!form.amaas_ip) errors.push("SSH 主机");
                  if (!form.ssh_user) errors.push("SSH 用户");
                  if (!form.appauto_branch) errors.push("Appauto 分支");

                  if (errors.length > 0) {
                    setError(`请填写必填项：${errors.join("、")}`);
                    setValidationErrors(new Set(
                      [
                        !form.amaas_ip ? "amaas_ip" : null,
                        !form.ssh_user ? "ssh_user" : null,
                        !form.appauto_branch ? "appauto_branch" : null,
                      ].filter(Boolean) as string[]
                    ));
                    return;
                  }

                  setLoading(true);
                  setError("");
                  setMessage("");

                  try {
                    const ssh_config = {
                      host: form.amaas_ip,
                      port: form.ssh_port || 22,
                      user: form.ssh_user,
                      auth_type: "password" as const,
                      password: form.ssh_password || undefined,
                      timeout: 30,
                    };

                    const payload = {
                      scenario: form.scenario,
                      ssh_config,
                      appauto_branch: form.appauto_branch || "main",
                      testpaths: form.testpaths || undefined,
                      case_level: form.case_level || undefined,
                      model_priority: form.model_priority || undefined,
                      ft_port: form.ft_port || undefined,
                      need_empty_gpu_count: form.need_empty_gpu_count !== undefined ? form.need_empty_gpu_count : undefined,
                      tp: form.tp || undefined,
                      lark_user: form.lark_user || undefined,
                      topic: form.topic || undefined,
                      notify_group: form.notify_group || undefined,
                      report_server: form.report_server || undefined,
                      report_url: form.report_url || undefined,
                      pytest_args: form.pytest_args || undefined,
                    };

                    const cachedToken = getAuthToken();
                    const response = await fetch(`${API_BASE}/basic-tests/run`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {}),
                      },
                      body: JSON.stringify(payload),
                    });

                    if (!response.ok) {
                      const errorData = await response.json();
                      throw new Error(errorData.detail || "测试启动失败");
                    }

                    const result = await response.json();
                    setMessage(`基础测试已提交！任务 ID: ${result.task_id}`);
                    await loadTasks();
                  } catch (err: any) {
                    setError(err.message || "测试启动失败");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                {loading ? "启动中..." : "运行基础测试"}
              </button>
            </div>

        {/* 消息显示 */}
        {message && <div className="success" style={{ marginTop: "1rem" }}>{message}</div>}
        {error && <div className="error" style={{ marginTop: "1rem" }}>{error}</div>}
      </CollapsiblePanel>

      {/* 基础测试任务列表 */}
      <section className="panel" style={{ marginTop: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0 }}>任务列表</h2>
          <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
            本页任务共计 {tasks.filter(t => t.engine === "pytest").length} 条
          </span>
        </div>
        <TaskTable
          tasks={tasks.filter(t => t.engine === "pytest")}
          profile={profile}
          columns={[
            commonColumns.id,
            commonColumns.uuid,
            commonColumns.engine,
            commonColumns.model,
            commonColumns.status,
            commonColumns.creator,
            commonColumns.createdAt,
          ]}
          defaultSortColumn="createdAt"
          defaultSortDirection="desc"
          enableSelection={true}
          selectionFilter={actionConditions.isOwner}
          batchActions={[
            {
              label: "批量删除",
              icon: "🗑️",
              color: "#dc3545",
              onClick: async (selectedTasks) => {
                await Promise.all(selectedTasks.map(task => handleDelete(task.id)));
                await loadTasks();
              },
              confirmMessage: batchConfirmMessages.batchDelete,
            },
          ]}
          actions={[
            {
              label: "下载",
              onClick: (task) => window.open(downloadUrl(task.id), "_blank"),
              condition: actionConditions.hasResult,
            },
            {
              label: "预览",
              onClick: (task) => handlePreview(task.id),
              color: "#17a2b8",
              condition: actionConditions.hasResult,
            },
            {
              label: "归档",
              onClick: (task) => handleArchive(task.id),
              condition: actionConditions.canArchive,
            },
            {
              label: "日志",
              onClick: (task) => handleViewLogs(task.id),
              color: "#007bff",
            },
            {
              label: "重试",
              onClick: (task) => handleRetry(task.id),
              color: "#28a745",
            },
            {
              label: "取消",
              onClick: (task) => handleCancel(task.id),
              color: "#ff9800",
              condition: (task, profile) =>
                actionConditions.isOwner(task, profile) && actionConditions.isRunningOrQueued(task),
            },
            {
              label: "删除",
              onClick: (task) => handleDelete(task.id),
              color: "#dc3545",
              condition: actionConditions.isOwner,
              confirmMessage: confirmMessages.delete,
            },
          ]}
          emptyMessage="暂无基础测试任务"
        />
    </section>
    </div>
  );
};
