import React from "react";
import { CollapsiblePanel, TaskTable } from "../components";
import { TaskTableColumn, TaskTableAction, columnRenderers, actionConditions, confirmMessages } from "../components/TaskTable";
import { TestRunForm, TaskSummary, Profile } from "../types";
import { API_BASE, getAuthToken } from "../api";

interface DeploymentPageProps {
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

  // Loading and messages
  loading: boolean;
  setLoading: (loading: boolean) => void;
  message: string;
  setMessage: (message: string) => void;
  success: string;
  setSuccess: (success: string) => void;

  // Deploy tasks
  deployTasks: TaskSummary[];
  loadDeployTasks: () => Promise<void>;
  profile: Profile | null;

  // Task actions
  handleViewLogs: (taskId: number) => void;
  cancelTask: (taskId: number) => Promise<void>;
  retryTask: (taskId: number) => Promise<void>;
  deleteTask: (taskId: number) => Promise<void>;
}

export const DeploymentPage: React.FC<DeploymentPageProps> = ({
  expandedSection,
  togglePanel,
  form,
  updateForm,
  validationErrors,
  setValidationErrors,
  appautoBranches,
  loadingBranches,
  loading,
  setLoading,
  message,
  setMessage,
  success,
  setSuccess,
  deployTasks,
  loadDeployTasks,
  profile,
  handleViewLogs,
  cancelTask,
  retryTask,
  deleteTask,
}) => {
  return (
    <div>
      {/* AMaaS 部署 */}
      <CollapsiblePanel
        id="deploy-amaas"
        title="部署 AMaaS 环境"
        icon="🚀"
        isExpanded={expandedSection === "deploy-amaas"}
        onToggle={togglePanel}
      >
            {/* Appauto 配置 */}
            <h3 style={{ marginTop: "0", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>Appauto 配置</h3>
            <div className="form-grid">
              <label>
                Appauto 分支 *
                <input
                  type="text"
                  list="appauto-branch-suggestions-deploy"
                  value={form.appauto_branch || ""}
                  onChange={(e) => {
                    updateForm("appauto_branch", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("appauto_branch");
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
                <datalist id="appauto-branch-suggestions-deploy">
                  {appautoBranches.map((branch) => (
                    <option key={branch} value={branch} />
                  ))}
                </datalist>
                {validationErrors.has("appauto_branch") && (
                  <span style={{ color: "#f87171", fontSize: "0.875rem" }}>
                    请填写 Appauto 分支
                  </span>
                )}
              </label>
            </div>

            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>部署配置</h3>
            <div className="form-grid">
              <label>
                IP *
                <input
                  type="text"
                  value={form.ip || ""}
                  onChange={(e) => {
                    updateForm("ip", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("ip");
                        return next;
                      });
                    }
                  }}
                  placeholder="192.168.1.1"
                  required
                  style={{
                    borderColor: validationErrors.has("ip") ? "#f87171" : undefined,
                  }}
                />
                {validationErrors.has("ip") && (
                  <span style={{ color: "#f87171", fontSize: "0.875rem" }}>
                    请填写 IP 地址
                  </span>
                )}
              </label>

              <label>
                Tag *
                <input
                  type="text"
                  value={form.tag || ""}
                  onChange={(e) => {
                    updateForm("tag", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("tag");
                        return next;
                      });
                    }
                  }}
                  placeholder="v1.0.0"
                  required
                  style={{
                    borderColor: validationErrors.has("tag") ? "#f87171" : undefined,
                  }}
                />
                {validationErrors.has("tag") && (
                  <span style={{ color: "#f87171", fontSize: "0.875rem" }}>
                    请填写 Tag
                  </span>
                )}
              </label>

              <label>
                Tar 包名 *
                <input
                  type="text"
                  value={form.tar_name || ""}
                  onChange={(e) => {
                    updateForm("tar_name", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("tar_name");
                        return next;
                      });
                    }
                  }}
                  placeholder="amaas.tar.gz"
                  required
                  style={{
                    borderColor: validationErrors.has("tar_name") ? "#f87171" : undefined,
                  }}
                />
                {validationErrors.has("tar_name") && (
                  <span style={{ color: "#f87171", fontSize: "0.875rem" }}>
                    请填写 Tar 包名
                  </span>
                )}
              </label>
            </div>

            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>SSH 配置</h3>
            <div className="form-grid">
              <label>
                SSH 用户名
                <input
                  type="text"
                  value={form.ssh_user || "qujing"}
                  onChange={(e) => updateForm("ssh_user", e.target.value)}
                  placeholder="qujing"
                />
              </label>

              <label>
                SSH 密码
                <input
                  type="password"
                  value={form.ssh_password || ""}
                  onChange={(e) => updateForm("ssh_password", e.target.value)}
                  placeholder="SSH 密码（可选，支持 key 登录）"
                />
              </label>

              <label>
                SSH 端口
                <input
                  type="number"
                  value={form.ssh_port || 22}
                  onChange={(e) => updateForm("ssh_port", parseInt(e.target.value))}
                  placeholder="22"
                />
              </label>
            </div>

            <div style={{ marginTop: "1.5rem" }}>
              <button
                className="primary"
                onClick={async () => {
                  setLoading(true);
                  setMessage("");
                  setSuccess("");
                  setValidationErrors(new Set());

                  // 验证必填项
                  const errors = new Set<string>();
                  if (!form.ip) errors.add("ip");
                  if (!form.tag) errors.add("tag");
                  if (!form.tar_name) errors.add("tar_name");
                  if (!form.appauto_branch) errors.add("appauto_branch");

                  if (errors.size > 0) {
                    setValidationErrors(errors);
                    setMessage("请填写所有必填项");
                    setLoading(false);
                    return;
                  }

                  // 验证 appauto 分支是否存在
                  if (form.appauto_branch && appautoBranches.length > 0 && !appautoBranches.includes(form.appauto_branch)) {
                    setValidationErrors(new Set(["appauto_branch"]));
                    setMessage(`Appauto 分支 "${form.appauto_branch}" 不存在，请从可用分支中选择`);
                    setLoading(false);
                    return;
                  }

                  try {
                    const cachedToken = getAuthToken();
                    const response = await fetch(`${API_BASE}/tests/deploy/amaas`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {}),
                      },
                      body: JSON.stringify({
                        ip: form.ip,
                        tag: form.tag,
                        tar_name: form.tar_name,
                        ssh_user: form.ssh_user || "qujing",
                        ssh_password: form.ssh_password || "qujing@$#21",
                        ssh_port: form.ssh_port || 22,
                        user: profile?.email,
                        appauto_branch: form.appauto_branch || "main",
                      }),
                    });

                    if (!response.ok) {
                      const errorData = await response.json();
                      throw new Error(errorData.detail || "部署请求失败");
                    }

                    const result = await response.json();
                    setSuccess(`AMaaS 部署任务已提交！任务 ID: ${result.display_id || result.task_id}`);

                    // 刷新部署任务列表
                    loadDeployTasks();
                  } catch (error: unknown) {
                    if (error instanceof Error) {
                      setMessage(`AMaaS 部署失败: ${error.message}`);
                    } else {
                      setMessage("AMaaS 部署失败");
                    }
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                {loading ? "提交中..." : "开始部署 AMaaS"}
              </button>
            </div>

            {message && <p className="error-message">{message}</p>}
            {success && <p className="success-message">{success}</p>}
      </CollapsiblePanel>

      {/* FT 部署 */}
      <div style={{ marginTop: "1rem" }}>
        <CollapsiblePanel
          id="deploy-ft"
          title="部署 FT 环境"
          icon="🚀"
          isExpanded={expandedSection === "deploy-ft"}
          onToggle={togglePanel}
        >
            {/* Appauto 配置 */}
            <h3 style={{ marginTop: "0", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>Appauto 配置</h3>
            <div className="form-grid">
              <label>
                Appauto 分支 *
                <input
                  type="text"
                  list="appauto-branch-suggestions-deploy-ft"
                  value={form.appauto_branch || ""}
                  onChange={(e) => {
                    updateForm("appauto_branch", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("appauto_branch");
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
                <datalist id="appauto-branch-suggestions-deploy-ft">
                  {appautoBranches.map((branch) => (
                    <option key={branch} value={branch} />
                  ))}
                </datalist>
                {validationErrors.has("appauto_branch") && (
                  <span style={{ color: "#f87171", fontSize: "0.875rem" }}>
                    请填写 Appauto 分支
                  </span>
                )}
              </label>
            </div>

            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>部署配置</h3>
            <div className="form-grid">
              <label>
                IP *
                <input
                  type="text"
                  value={form.ip || ""}
                  onChange={(e) => {
                    updateForm("ip", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("ip");
                        return next;
                      });
                    }
                  }}
                  placeholder="192.168.1.1"
                  required
                  style={{
                    borderColor: validationErrors.has("ip") ? "#f87171" : undefined,
                  }}
                />
                {validationErrors.has("ip") && (
                  <span style={{ color: "#f87171", fontSize: "0.875rem" }}>
                    请填写 IP 地址
                  </span>
                )}
              </label>

              <label>
                Image
                <input
                  type="text"
                  value={form.image || ""}
                  onChange={(e) => {
                    updateForm("image", e.target.value);
                  }}
                  placeholder="默认: approachingai/ktransformers"
                />
              </label>

              <label>
                Tag *
                <input
                  type="text"
                  value={form.tag || ""}
                  onChange={(e) => {
                    updateForm("tag", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("tag");
                        return next;
                      });
                    }
                  }}
                  placeholder="v1.0.0"
                  required
                  style={{
                    borderColor: validationErrors.has("tag") ? "#f87171" : undefined,
                  }}
                />
                {validationErrors.has("tag") && (
                  <span style={{ color: "#f87171", fontSize: "0.875rem" }}>
                    请填写 Tag
                  </span>
                )}
              </label>

              <label>
                Tar 包名 *
                <input
                  type="text"
                  value={form.tar_name || ""}
                  onChange={(e) => {
                    updateForm("tar_name", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("tar_name");
                        return next;
                      });
                    }
                  }}
                  placeholder="ft.tar"
                  required
                  style={{
                    borderColor: validationErrors.has("tar_name") ? "#f87171" : undefined,
                  }}
                />
                {validationErrors.has("tar_name") && (
                  <span style={{ color: "#f87171", fontSize: "0.875rem" }}>
                    请填写 Tar 包名
                  </span>
                )}
              </label>
            </div>

            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>SSH 配置</h3>
            <div className="form-grid">
              <label>
                SSH 用户名
                <input
                  type="text"
                  value={form.ssh_user || "qujing"}
                  onChange={(e) => updateForm("ssh_user", e.target.value)}
                  placeholder="qujing"
                />
              </label>

              <label>
                SSH 密码
                <input
                  type="password"
                  value={form.ssh_password || ""}
                  onChange={(e) => updateForm("ssh_password", e.target.value)}
                  placeholder="SSH 密码（可选，支持 key 登录）"
                />
              </label>

              <label>
                SSH 端口
                <input
                  type="number"
                  value={form.ssh_port || 22}
                  onChange={(e) => updateForm("ssh_port", parseInt(e.target.value))}
                  placeholder="22"
                />
              </label>
            </div>

            <div style={{ marginTop: "1.5rem" }}>
              <button
                className="primary"
                onClick={async () => {
                  setLoading(true);
                  setMessage("");
                  setSuccess("");
                  setValidationErrors(new Set());

                  // 验证必填项
                  const errors = new Set<string>();
                  if (!form.ip) errors.add("ip");
                  if (!form.tag) errors.add("tag");
                  if (!form.tar_name) errors.add("tar_name");
                  if (!form.appauto_branch) errors.add("appauto_branch");

                  if (errors.size > 0) {
                    setValidationErrors(errors);
                    setMessage("请填写所有必填项");
                    setLoading(false);
                    return;
                  }

                  // 验证 appauto 分支是否存在
                  if (form.appauto_branch && appautoBranches.length > 0 && !appautoBranches.includes(form.appauto_branch)) {
                    setValidationErrors(new Set(["appauto_branch"]));
                    setMessage(`Appauto 分支 "${form.appauto_branch}" 不存在，请从可用分支中选择`);
                    setLoading(false);
                    return;
                  }

                  try {
                    const cachedToken = getAuthToken();
                    const response = await fetch(`${API_BASE}/tests/deploy/ft`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {}),
                      },
                      body: JSON.stringify({
                        ip: form.ip,
                        image: form.image || "approachingai/ktransformers",
                        tag: form.tag,
                        tar_name: form.tar_name,
                        ssh_user: form.ssh_user || "qujing",
                        ssh_password: form.ssh_password || "qujing@$#21",
                        ssh_port: form.ssh_port || 22,
                        user: profile?.email,
                        appauto_branch: form.appauto_branch || "main",
                      }),
                    });

                    if (!response.ok) {
                      const errorData = await response.json();
                      throw new Error(errorData.detail || "部署请求失败");
                    }

                    const result = await response.json();
                    setSuccess(`FT 部署任务已提交！任务 ID: ${result.display_id || result.task_id}`);

                    // 刷新部署任务列表
                    loadDeployTasks();
                  } catch (error: unknown) {
                    if (error instanceof Error) {
                      setMessage(`FT 部署失败: ${error.message}`);
                    } else {
                      setMessage("FT 部署失败");
                    }
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                {loading ? "提交中..." : "开始部署 FT"}
              </button>
            </div>

            {message && <p className="error-message">{message}</p>}
            {success && <p className="success-message">{success}</p>}
        </CollapsiblePanel>
      </div>

      {/* 部署任务列表 */}
      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>部署任务列表</h2>
        <TaskTable
          tasks={deployTasks}
          profile={profile}
          columns={[
            { key: "id", label: "ID", render: columnRenderers.id },
            { key: "type", label: "类型", render: columnRenderers.model },
            { key: "status", label: "状态", render: columnRenderers.status },
            { key: "createdAt", label: "创建时间", render: (task) => new Date(task.created_at).toLocaleString("zh-CN") },
          ]}
          actions={[
            {
              label: "日志",
              onClick: (task) => handleViewLogs(task.id),
              color: "#6366f1",
            },
            {
              label: "取消",
              onClick: (task) => cancelTask(task.id),
              color: "#f59e0b",
              condition: actionConditions.isRunning,
            },
            {
              label: "重试",
              onClick: (task) => retryTask(task.id),
              color: "#10b981",
              condition: actionConditions.isFailed,
            },
            {
              label: "删除",
              onClick: (task) => deleteTask(task.id),
              color: "#ef4444",
              confirmMessage: confirmMessages.deleteDeployment,
            },
          ]}
          emptyMessage="暂无部署任务"
          showTaskCount={true}
          taskCountLabel="共"
        />
      </section>
    </div>
  );
};
