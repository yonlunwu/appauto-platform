import React from "react";
import { CollapsiblePanel, TaskTable, Pagination } from "../components";
import { TaskTableColumn, TaskTableAction, commonColumns, actionConditions, confirmMessages, batchConfirmMessages } from "../components/TaskTable";
import { TestRunForm, TaskSummary, Profile, ModelInfo } from "../types";
import { runEvalTest } from "../api";
import { UsePaginationReturn } from "../hooks";

interface CorrectnessTestPageProps {
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
  showPassword: { ssh: boolean; amaas: boolean; auth: boolean };
  setShowPassword: React.Dispatch<React.SetStateAction<{ ssh: boolean; amaas: boolean; auth: boolean }>>;

  // Loading and messages
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  success: string | null;
  setSuccess: (success: string | null) => void;

  // Tasks
  tasks: TaskSummary[];
  loadTasks: () => Promise<void>;
  profile: Profile | null;

  // Task actions
  handleViewLogs: (taskId: number) => void;
  handleRetry: (taskId: number) => Promise<void>;
  handleCancel: (taskId: number) => Promise<void>;
  handleDelete: (taskId: number) => Promise<void>;

  // Model scanning
  scannedModels: ModelInfo[];
  scanningModels: boolean;
  handleScanModels: () => Promise<void>;

  // Pagination
  evalPagination: UsePaginationReturn;
}

export const CorrectnessTestPage: React.FC<CorrectnessTestPageProps> = ({
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
  success,
  setSuccess,
  tasks,
  loadTasks,
  profile,
  handleViewLogs,
  handleRetry,
  handleCancel,
  handleDelete,
  scannedModels,
  scanningModels,
  handleScanModels,
  evalPagination,
}) => {
  return (
    <div>
      {/* 第一个可折叠菜单：已有运行中模型 */}
      <CollapsiblePanel
        id="eval-existing-model"
        title="模型已运行，直接进行正确性测试"
        icon="📊"
        isExpanded={expandedSection === "eval-existing-model"}
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
                    name="eval-scenario-existing"
                    value="ft"
                    checked={form.scenario === "ft"}
                    onChange={(e) => {
                      updateForm("scenario", e.target.value as "ft" | "amaas");
                      updateForm("eval_port", undefined);  // 清空端口,使用新场景默认值
                    }}
                  />
                  <span>基于 FT</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="radio"
                    name="eval-scenario-existing"
                    value="amaas"
                    checked={form.scenario === "amaas"}
                    onChange={(e) => {
                      updateForm("scenario", e.target.value as "ft" | "amaas");
                      updateForm("eval_port", undefined);  // 清空端口,使用新场景默认值
                    }}
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
                  list="appauto-branch-suggestions-eval-existing"
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
                <datalist id="appauto-branch-suggestions-eval-existing">
                  {appautoBranches.map((branch) => (
                    <option key={branch} value={branch} />
                  ))}
                </datalist>
                <small style={{ color: "#666" }}>指定 appauto 的 git 分支版本</small>
              </label>
            </div>

            {/* 连接配置 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>连接配置</h3>
            <div className="form-grid">
              <label>
                服务器 IP *
                <input
                  type="text"
                  value={form.amaas_ip || ""}
                  onChange={(e) => updateForm("amaas_ip", e.target.value)}
                  placeholder="例如: 192.168.1.100"
                  required
                />
              </label>

              <label>
                API 端口 *
                <input
                  type="number"
                  value={form.eval_port !== undefined ? form.eval_port : (form.scenario === "amaas" ? 10011 : 30000)}
                  onChange={(e) => {
                    const value = e.target.value === "" ? undefined : parseInt(e.target.value);
                    updateForm("eval_port", value);
                    if (value !== undefined) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("eval_port");
                        return next;
                      });
                    }
                  }}
                  placeholder={form.scenario === "amaas" ? "默认: 10011" : "默认: 30000"}
                  required
                  style={{
                    borderColor: validationErrors.has("eval_port") ? "#f87171" : undefined,
                  }}
                />
                <small style={{ color: "#666" }}>
                  模型服务端口{form.scenario === "amaas" ? " (AMaaS 默认 10011)" : " (FT 默认 30000)"}
                </small>
              </label>
            </div>

            {/* SSH 配置 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>SSH 配置</h3>
            <div className="form-grid">
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
                    placeholder="SSH 密码（可选，支持 key 登录）"
                    style={{
                      flex: 1,
                      paddingRight: "2.5rem",
                    }}
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

            {/* 评测参数 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>评测参数</h3>
            <div className="form-grid">
              <label>
                数据集 *
                <input
                  type="text"
                  value={form.dataset || ""}
                  onChange={(e) => {
                    updateForm("dataset", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("dataset");
                        return next;
                      });
                    }
                  }}
                  placeholder="例如: aime24, mmlu, ceval"
                  required
                  style={{
                    borderColor: validationErrors.has("dataset") ? "#f87171" : undefined,
                  }}
                />
                <small style={{ color: "#666" }}>评测数据集名称</small>
              </label>

              <label>
                并发度 *
                <input
                  type="number"
                  value={form.eval_concurrency === undefined ? "" : form.eval_concurrency}
                  onChange={(e) => {
                    updateForm("eval_concurrency", e.target.value === "" ? undefined : parseInt(e.target.value));
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("eval_concurrency");
                        return next;
                      });
                    }
                  }}
                  placeholder="例如: 2"
                  min="1"
                  required
                  style={{
                    borderColor: validationErrors.has("eval_concurrency") ? "#f87171" : undefined,
                  }}
                />
              </label>

              <label>
                temperature *
                <input
                  type="number"
                  step="0.1"
                  value={form.temperature === undefined ? "" : form.temperature}
                  onChange={(e) => {
                    updateForm("temperature", e.target.value === "" ? undefined : parseFloat(e.target.value));
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("temperature");
                        return next;
                      });
                    }
                  }}
                  placeholder="例如: 0.6"
                  min="0"
                  max="2"
                  required
                  style={{
                    borderColor: validationErrors.has("temperature") ? "#f87171" : undefined,
                  }}
                />
              </label>

              <label>
                最大 Token 数 *
                <input
                  type="number"
                  value={form.max_tokens === undefined ? "" : form.max_tokens}
                  onChange={(e) => {
                    updateForm("max_tokens", e.target.value === "" ? undefined : parseInt(e.target.value));
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("max_tokens");
                        return next;
                      });
                    }
                  }}
                  placeholder="例如: 35000"
                  required
                  style={{
                    borderColor: validationErrors.has("max_tokens") ? "#f87171" : undefined,
                  }}
                />
              </label>

              <label>
                测试超时时间（小时）
                <input
                  type="number"
                  step="0.5"
                  value={form.timeout_hours === undefined ? "" : form.timeout_hours}
                  onChange={(e) => updateForm("timeout_hours", e.target.value === "" ? undefined : parseFloat(e.target.value))}
                  placeholder="默认: 4h"
                />
                <small style={{ color: "#666" }}>测试超时时间，超时后任务会被标记为失败</small>
              </label>

              <label>
                限制题数
                <input
                  type="number"
                  value={form.eval_limit === undefined ? "" : form.eval_limit}
                  onChange={(e) => updateForm("eval_limit", e.target.value === "" ? undefined : parseInt(e.target.value))}
                  placeholder="可选，限制每个子集跑前 n 题"
                />
              </label>
            </div>

            {/* 模型配置 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>
              模型配置
              <button
                type="button"
                className="secondary"
                onClick={handleScanModels}
                disabled={scanningModels || !form.amaas_ip || !form.ssh_user}
                style={{ marginLeft: "1rem", fontSize: "0.875rem", padding: "0.5rem 1rem" }}
              >
                {scanningModels ? "扫描中..." : "🔍 扫描远程模型"}
              </button>
              {scannedModels.length > 0 && (
                <span style={{ marginLeft: "0.75rem", color: "#4ade80", fontSize: "0.875rem" }}>
                  ✓ 已扫描 {scannedModels.length} 个模型
                </span>
              )}
            </h3>
            <div className="form-grid">
              <label>
                模型名称 *
                <input
                  type="text"
                  list="model-suggestions-eval"
                  value={form.model}
                  onChange={(e) => updateForm("model", e.target.value)}
                  placeholder={scannedModels.length > 0 ? "从扫描结果中选择或输入" : "请先扫描远程模型"}
                  required
                />
                <datalist id="model-suggestions-eval">
                  {scannedModels.map((model) => (
                    <option key={model.name} value={model.name} />
                  ))}
                </datalist>
              </label>
            </div>

            {/* 可选项 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>可选项</h3>
            <div style={{ display: "flex", gap: "2rem", marginTop: "0.5rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexDirection: "row" }}>
                <input
                  type="checkbox"
                  checked={form.enable_thinking || false}
                  onChange={(e) => updateForm("enable_thinking", e.target.checked)}
                />
                开启 Thinking 模式
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexDirection: "row" }}>
                <input
                  type="checkbox"
                  checked={form.debug || false}
                  onChange={(e) => updateForm("debug", e.target.checked)}
                />
                开启 Debug 模式
              </label>
            </div>

            {/* 提交按钮 */}
            <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
              <button
                className="primary"
                onClick={async () => {
                  try {
                    setLoading(true);
                    setError("");
                    setSuccess("");

                    // 验证必填项
                    const errors = new Set<string>();
                    const errorMessages: string[] = [];

                    if (!form.appauto_branch) {
                      errors.add("appauto_branch");
                      errorMessages.push("Appauto 分支");
                    }
                    if (!form.amaas_ip) {
                      errors.add("amaas_ip");
                      errorMessages.push("IP");
                    }
                    if (!form.ssh_user) {
                      errors.add("ssh_user");
                      errorMessages.push("SSH 用户");
                    }
                    if (!form.dataset) {
                      errors.add("dataset");
                      errorMessages.push("数据集");
                    }
                    if (form.eval_concurrency === undefined) {
                      errors.add("eval_concurrency");
                      errorMessages.push("并发度");
                    }
                    if (form.temperature === undefined) {
                      errors.add("temperature");
                      errorMessages.push("temperature");
                    }
                    if (form.max_tokens === undefined) {
                      errors.add("max_tokens");
                      errorMessages.push("最大 Token 数");
                    }
                    if (!form.model) {
                      errors.add("model");
                      errorMessages.push("模型名称");
                    }

                    if (errors.size > 0) {
                      setValidationErrors(errors);
                      setError(`请填写以下必填项：${errorMessages.join("、")}`);
                      setLoading(false);
                      return;
                    }

                  const timeoutHours = Number(form.timeout_hours) || 1; // 转数字，空值/NaN则默认1
                  const timeoutSeconds = timeoutHours * 3600;

                    const payload = {
                      base: form.scenario,
                      skip_launch: true,
                      ip: form.amaas_ip || "",
                      port: form.eval_port !== undefined ? form.eval_port : (form.scenario === "amaas" ? 10011 : 30000),
                      model: form.model,
                      ssh_user: form.ssh_user || "",
                      ssh_password: form.ssh_password,
                      ssh_port: form.ssh_port || 22,
                      dataset: form.dataset || "",
                      dataset_args: form.dataset_args,
                      max_tokens: form.max_tokens,
                      concurrency: form.eval_concurrency,
                      limit: form.eval_limit,
                      temperature: form.temperature,
                      enable_thinking: form.enable_thinking || false,
                      debug: form.debug || false,
                      keep_model: true,
                      appauto_branch: form.appauto_branch || "main",
                      timeout: timeoutSeconds,
                    };

                    const response = await runEvalTest(payload);
                    setSuccess(`正确性测试任务已提交！任务 ID: ${response.display_id || response.task_id}`);
                    await loadTasks();
                  } catch (err: any) {
                    setError(err.message || "提交失败");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                {loading ? "提交中..." : "开始正确性测试"}
              </button>
            </div>

            {/* 消息显示 */}
            {success && <div className="success" style={{ marginTop: "1rem" }}>{success}</div>}
            {error && <div className="error" style={{ marginTop: "1rem" }}>{error}</div>}
      </CollapsiblePanel>

      {/* 第二个可折叠菜单：拉起模型并进行测试 */}
      <div style={{ marginTop: "1rem" }}>
        <CollapsiblePanel
          id="eval-launch-model"
          title="拉起模型并进行正确性测试"
          icon="🚀"
          isExpanded={expandedSection === "eval-launch-model"}
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
                    name="eval-scenario-launch"
                    value="ft"
                    checked={form.scenario === "ft"}
                    onChange={(e) => {
                      updateForm("scenario", e.target.value as "ft" | "amaas");
                      updateForm("eval_port", undefined);  // 清空端口,使用新场景默认值
                    }}
                  />
                  <span>基于 FT</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="radio"
                    name="eval-scenario-launch"
                    value="amaas"
                    checked={form.scenario === "amaas"}
                    onChange={(e) => {
                      updateForm("scenario", e.target.value as "ft" | "amaas");
                      updateForm("eval_port", undefined);  // 清空端口,使用新场景默认值
                    }}
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
                  list="appauto-branch-suggestions-eval-launch"
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
                <datalist id="appauto-branch-suggestions-eval-launch">
                  {appautoBranches.map((branch) => (
                    <option key={branch} value={branch} />
                  ))}
                </datalist>
                <small style={{ color: "#666" }}>指定 appauto 的 git 分支版本</small>
              </label>
            </div>

            {/* 连接配置 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>连接配置</h3>
            <div className="form-grid">
              <label>
                服务器 IP *
                <input
                  type="text"
                  value={form.amaas_ip || ""}
                  onChange={(e) => updateForm("amaas_ip", e.target.value)}
                  placeholder="例如: 192.168.1.100"
                  required
                />
              </label>
            
              <label>
                API 端口 *
                <input
                  type="number"
                  value={form.eval_port !== undefined ? form.eval_port : (form.scenario === "amaas" ? 10011 : 30000)}
                  onChange={(e) => {
                    const value = e.target.value === "" ? undefined : parseInt(e.target.value);
                    updateForm("eval_port", value);
                    if (value !== undefined) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("eval_port");
                        return next;
                      });
                    }
                  }}
                  placeholder={form.scenario === "amaas" ? "默认: 10011" : "默认: 30000"}
                  required
                  style={{
                    borderColor: validationErrors.has("eval_port") ? "#f87171" : undefined,
                  }}
                />
                <small style={{ color: "#666" }}>
                  模型服务端口{form.scenario === "amaas" ? " (AMaaS 默认 10011)" : " (FT 默认 30000)"}
                </small>
              </label>
</div>

            {/* SSH 配置 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>SSH 配置</h3>
            <div className="form-grid">
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
                    placeholder="SSH 密码（可选，支持 key 登录）"
                    style={{
                      flex: 1,
                      paddingRight: "2.5rem",
                    }}
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

            {/* 模型启动配置 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>
              模型启动配置
              <button
                type="button"
                className="secondary"
                onClick={handleScanModels}
                disabled={scanningModels || !form.amaas_ip || !form.ssh_user}
                style={{ marginLeft: "1rem", fontSize: "0.875rem", padding: "0.5rem 1rem" }}
              >
                {scanningModels ? "扫描中..." : "🔍 扫描远程模型"}
              </button>
              {scannedModels.length > 0 && (
                <span style={{ marginLeft: "0.75rem", color: "#4ade80", fontSize: "0.875rem" }}>
                  ✓ 已扫描 {scannedModels.length} 个模型
                </span>
              )}
            </h3>
            <div className="form-grid">
              <label>
                模型名称 *
                <input
                  type="text"
                  list="model-suggestions-eval-launch"
                  value={form.model}
                  onChange={(e) => updateForm("model", e.target.value)}
                  placeholder={scannedModels.length > 0 ? "从扫描结果中选择或输入" : "请先扫描远程模型"}
                  required
                />
                <datalist id="model-suggestions-eval-launch">
                  {scannedModels.map((model) => (
                    <option key={model.name} value={model.name} />
                  ))}
                </datalist>
              </label>

              <label>
                TP (Tensor Parallelism)
                <select
                  value={form.model_tp}
                  onChange={(e) => updateForm("model_tp", parseInt(e.target.value))}
                  required
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                  <option value={8}>8</option>
                </select>
              </label>

              <label>
                启动超时时间（秒）
                <input
                  type="number"
                  value={form.launch_timeout === undefined ? 900 : form.launch_timeout}
                  onChange={(e) => updateForm("launch_timeout", e.target.value === "" ? undefined : parseInt(e.target.value))}
                  placeholder="默认: 900"
                  min="60"
                />
              </label>
            </div>

            {/* 评测参数 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>评测参数</h3>
            <div className="form-grid">
              <label>
                数据集 *
                <input
                  type="text"
                  value={form.dataset || ""}
                  onChange={(e) => {
                    updateForm("dataset", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("dataset");
                        return next;
                      });
                    }
                  }}
                  placeholder="例如: aime24, mmlu, ceval"
                  required
                  style={{
                    borderColor: validationErrors.has("dataset") ? "#f87171" : undefined,
                  }}
                />
                <small style={{ color: "#666" }}>评测数据集名称</small>
              </label>

              <label>
                并发度 *
                <input
                  type="number"
                  value={form.eval_concurrency === undefined ? "" : form.eval_concurrency}
                  onChange={(e) => {
                    updateForm("eval_concurrency", e.target.value === "" ? undefined : parseInt(e.target.value));
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("eval_concurrency");
                        return next;
                      });
                    }
                  }}
                  placeholder="例如: 2"
                  min="1"
                  required
                  style={{
                    borderColor: validationErrors.has("eval_concurrency") ? "#f87171" : undefined,
                  }}
                />
              </label>

              <label>
                temperature *
                <input
                  type="number"
                  step="0.1"
                  value={form.temperature === undefined ? "" : form.temperature}
                  onChange={(e) => {
                    updateForm("temperature", e.target.value === "" ? undefined : parseFloat(e.target.value));
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("temperature");
                        return next;
                      });
                    }
                  }}
                  placeholder="例如: 0.6"
                  min="0"
                  max="2"
                  required
                  style={{
                    borderColor: validationErrors.has("temperature") ? "#f87171" : undefined,
                  }}
                />
              </label>

              <label>
                最大 Token 数 *
                <input
                  type="number"
                  value={form.max_tokens === undefined ? "" : form.max_tokens}
                  onChange={(e) => {
                    updateForm("max_tokens", e.target.value === "" ? undefined : parseInt(e.target.value));
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("max_tokens");
                        return next;
                      });
                    }
                  }}
                  placeholder="例如: 35000"
                  required
                  style={{
                    borderColor: validationErrors.has("max_tokens") ? "#f87171" : undefined,
                  }}
                />
              </label>

              <label>
                测试超时时间（小时）
                <input
                  type="number"
                  step="0.5"
                  value={form.timeout_hours === undefined ? "" : form.timeout_hours}
                  onChange={(e) => updateForm("timeout_hours", e.target.value === "" ? undefined : parseFloat(e.target.value))}
                  placeholder="默认: 4h"
                />
                <small style={{ color: "#666" }}>测试超时时间，超时后任务会被标记为失败</small>
              </label>

              <label>
                限制题数
                <input
                  type="number"
                  value={form.eval_limit === undefined ? "" : form.eval_limit}
                  onChange={(e) => updateForm("eval_limit", e.target.value === "" ? undefined : parseInt(e.target.value))}
                  placeholder="可选，限制每个子集跑前 n 题"
                />
              </label>
            </div>

            {/* 可选项 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>可选项</h3>
            <div style={{ display: "flex", gap: "2rem", marginTop: "0.5rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexDirection: "row" }}>
                <input
                  type="checkbox"
                  checked={form.enable_thinking || false}
                  onChange={(e) => updateForm("enable_thinking", e.target.checked)}
                />
                开启 Thinking 模式
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexDirection: "row" }}>
                <input
                  type="checkbox"
                  checked={form.keep_model || false}
                  onChange={(e) => updateForm("keep_model", e.target.checked)}
                />
                测试后保持模型运行
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexDirection: "row" }}>
                <input
                  type="checkbox"
                  checked={form.debug || false}
                  onChange={(e) => updateForm("debug", e.target.checked)}
                />
                开启 Debug 模式
              </label>
            </div>

            {/* 提交按钮 */}
            <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
              <button
                className="primary"
                onClick={async () => {
                  try {
                    setLoading(true);
                    setError("");
                    setSuccess("");

                    // 验证必填项
                    const errors = new Set<string>();
                    const errorMessages: string[] = [];

                    if (!form.appauto_branch) {
                      errors.add("appauto_branch");
                      errorMessages.push("Appauto 分支");
                    }
                    if (!form.amaas_ip) {
                      errors.add("amaas_ip");
                      errorMessages.push("IP");
                    }
                    if (!form.ssh_user) {
                      errors.add("ssh_user");
                      errorMessages.push("SSH 用户");
                    }
                    if (!form.dataset) {
                      errors.add("dataset");
                      errorMessages.push("数据集");
                    }
                    if (form.eval_concurrency === undefined) {
                      errors.add("eval_concurrency");
                      errorMessages.push("并发度");
                    }
                    if (form.temperature === undefined) {
                      errors.add("temperature");
                      errorMessages.push("temperature");
                    }
                    if (form.max_tokens === undefined) {
                      errors.add("max_tokens");
                      errorMessages.push("最大 Token 数");
                    }
                    if (!form.model) {
                      errors.add("model");
                      errorMessages.push("模型名称");
                    }
                    if (!form.model_tp) {
                      errors.add("model_tp");
                      errorMessages.push("TP");
                    }

                    if (errors.size > 0) {
                      setValidationErrors(errors);
                      setError(`请填写以下必填项：${errorMessages.join("、")}`);
                      setLoading(false);
                      return;
                    }

                  const timeoutHours = Number(form.timeout_hours) || 1; // 转数字，空值/NaN则默认1
                  const timeoutSeconds = timeoutHours * 3600;

                    const payload = {
                      base: form.scenario,
                      skip_launch: false,
                      ip: form.amaas_ip || "",
                      port: form.eval_port !== undefined ? form.eval_port : (form.scenario === "amaas" ? 10011 : 30000),
                      model: form.model,
                      ssh_user: form.ssh_user || "",
                      ssh_password: form.ssh_password,
                      ssh_port: form.ssh_port || 22,
                      tp: form.model_tp,
                      launch_timeout: form.launch_timeout || 900,
                      dataset: form.dataset || "",
                      dataset_args: form.dataset_args,
                      max_tokens: form.max_tokens,
                      concurrency: form.eval_concurrency,
                      limit: form.eval_limit,
                      temperature: form.temperature,
                      enable_thinking: form.enable_thinking || false,
                      keep_model: form.keep_model || false,
                      debug: form.debug || false,
                      appauto_branch: form.appauto_branch || "main",
                      timeout: timeoutSeconds,
                    };

                    const response = await runEvalTest(payload);
                    setSuccess(`正确性测试任务已提交！任务 ID: ${response.display_id || response.task_id}`);
                    await loadTasks();
                  } catch (err: any) {
                    setError(err.message || "提交失败");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                {loading ? "提交中..." : "拉起模型并测试"}
              </button>
            </div>

            {/* 消息显示 */}
            {success && <div className="success" style={{ marginTop: "1rem" }}>{success}</div>}
            {error && <div className="error" style={{ marginTop: "1rem" }}>{error}</div>}
        </CollapsiblePanel>
      </div>

      {/* 正确性测试任务列表 */}
      <section className="panel" style={{ marginTop: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0 }}>任务列表</h2>
          <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
            本页任务共计 {tasks.length} 条
          </span>
        </div>
        <TaskTable
          tasks={tasks}
          profile={profile}
          columns={[
            commonColumns.id,
            commonColumns.uuid,
            commonColumns.dataset,
            commonColumns.model,
            commonColumns.status,
            commonColumns.score,
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
              confirmMessage: confirmMessages.deleteWithDataset,
            },
          ]}
          emptyMessage="暂无正确性测试任务"
        />

        {/* Pagination controls */}
        <Pagination
          currentPage={evalPagination.currentPage}
          totalPages={evalPagination.totalPages}
          onPageChange={evalPagination.setCurrentPage}
        />
      </section>
    </div>
  );
};
