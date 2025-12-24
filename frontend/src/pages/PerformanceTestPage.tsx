import React from "react";
import { CollapsiblePanel, TaskTable, Pagination } from "../components";
import { TaskTableColumn, TaskTableAction, commonColumns, actionConditions, confirmMessages, batchConfirmMessages } from "../components/TaskTable";
import { downloadUrl, runPerfTest, scanModels } from "../api";
import { ModelInfo, Profile, TaskSummary, TestRunForm } from "../types";

interface PerformanceTestPageProps {
  expandedSection: string | null;
  togglePanel: (panelId: string) => void;
  form: TestRunForm;
  updateForm: <K extends keyof TestRunForm>(key: K, value: TestRunForm[K]) => void;
  validationErrors: Set<string>;
  setValidationErrors: React.Dispatch<React.SetStateAction<Set<string>>>;
  validatePerfTestForm: () => { isValid: boolean; errors: Set<string>; message: string };
  validateLaunchTestForm: () => { isValid: boolean; errors: Set<string>; message: string };
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  message: string | null;
  setMessage: React.Dispatch<React.SetStateAction<string | null>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  loadTasks: () => Promise<void>;
  showPassword: { auth: boolean; ssh: boolean; amaas: boolean };
  setShowPassword: React.Dispatch<React.SetStateAction<{ auth: boolean; ssh: boolean; amaas: boolean }>>;
  scannedModels: ModelInfo[];
  setScannedModels: React.Dispatch<React.SetStateAction<ModelInfo[]>>;
  scanningModels: boolean;
  setScanningModels: React.Dispatch<React.SetStateAction<boolean>>;
  handleScanModels: () => Promise<void>;
  appautoBranches: string[];
  loadingBranches: boolean;
  tasks: TaskSummary[];
  profile: Profile;
  handlePreview: (taskId: number) => Promise<void>;
  handleArchive: (taskId: number) => Promise<void>;
  handleViewLogs: (taskId: number) => Promise<void>;
  handleRetry: (taskId: number) => Promise<void>;
  handleCancel: (taskId: number) => Promise<void>;
  handleDelete: (taskId: number) => Promise<void>;
  perfPagination: {
    currentPage: number;
    totalPages: number;
    setCurrentPage: (page: number) => void;
  };
}

export function PerformanceTestPage({
  expandedSection,
  togglePanel,
  form,
  updateForm,
  validationErrors,
  setValidationErrors,
  validatePerfTestForm,
  validateLaunchTestForm,
  loading,
  setLoading,
  message,
  setMessage,
  error,
  setError,
  loadTasks,
  showPassword,
  setShowPassword,
  scannedModels,
  setScannedModels,
  scanningModels,
  setScanningModels,
  handleScanModels,
  appautoBranches,
  loadingBranches,
  tasks,
  profile,
  handlePreview,
  handleArchive,
  handleViewLogs,
  handleRetry,
  handleCancel,
  handleDelete,
  perfPagination,
}: PerformanceTestPageProps) {
  return (
    <div>
      {/* 第一个可折叠菜单：已有运行中模型 */}
      <CollapsiblePanel
        id="existing-model"
        title="模型已运行，直接进行性能测试"
        icon="📊"
        isExpanded={expandedSection === "existing-model"}
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
                    name="scenario"
                    value="ft"
                    checked={form.scenario === "ft"}
                    onChange={(e) => updateForm("scenario", e.target.value as "ft" | "amaas")}
                  />
                  <span>基于 FT</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="radio"
                    name="scenario"
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
                  list="appauto-branch-suggestions-perf-existing"
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
                <datalist id="appauto-branch-suggestions-perf-existing">
                  {appautoBranches.map((branch) => (
                    <option key={branch} value={branch} />
                  ))}
                </datalist>
                <small style={{ color: "#666" }}>指定 appauto 的 git 分支版本</small>
              </label>
            </div>

            {/* AMaaS 配置表单 */}
            {form.scenario === "amaas" && (
              <div>
                {/* 连接配置 */}
                <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>连接配置</h3>
                <div className="form-grid">
                  <label>
                    AMaaS IP *
                    <input
                      type="text"
                      value={form.amaas_ip || ""}
                      onChange={(e) => {
                        updateForm("amaas_ip", e.target.value);
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("amaas_ip");
                            return next;
                          });
                        }
                      }}
                      placeholder="例如: 192.168.1.100"
                      required
                      style={{
                        borderColor: validationErrors.has("amaas_ip") ? "#f87171" : undefined,
                      }}
                    />
                  </label>

                  <label>
                    AMaaS 用户名
                    <input
                      type="text"
                      value={form.amaas_api_user || "admin"}
                      onChange={(e) => updateForm("amaas_api_user", e.target.value)}
                      placeholder="默认: admin"
                    />
                  </label>

                  <label>
                    AMaaS 密码 *
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <input
                        type={showPassword.amaas ? "text" : "password"}
                        value={form.amaas_api_passwd || ""}
                        onChange={(e) => {
                          updateForm("amaas_api_passwd", e.target.value);
                          if (e.target.value) {
                            setValidationErrors(prev => {
                              const next = new Set(prev);
                              next.delete("amaas_api_passwd");
                              return next;
                            });
                          }
                        }}
                        placeholder="请输入 AMaaS API 密码"
                        required
                        style={{
                          flex: 1,
                          paddingRight: "2.5rem",
                          borderColor: validationErrors.has("amaas_api_passwd") ? "#f87171" : undefined,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(prev => ({ ...prev, amaas: !prev.amaas }))}
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
                        title={showPassword.amaas ? "隐藏密码" : "显示密码"}
                      >
                        {showPassword.amaas ? "隐藏" : "显示"}
                      </button>
                    </div>
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
                      onChange={(e) => {
                        updateForm("ssh_user", e.target.value);
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("ssh_user");
                            return next;
                          });
                        }
                      }}
                      placeholder="SSH 登录用户名"
                      required
                      style={{
                        borderColor: validationErrors.has("ssh_user") ? "#f87171" : undefined,
                      }}
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

                {/* 测试参数 */}
                <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>测试参数</h3>
                <div className="form-grid">
                  <label>
                    并发度 *
                    <input
                      type="text"
                      value={form.concurrency || ""}
                      onChange={(e) => {
                        updateForm("concurrency", e.target.value);
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("concurrency");
                            return next;
                          });
                        }
                      }}
                      onBlur={(e) => updateForm("concurrency", e.target.value.trim())}
                      placeholder="例如: 4 或 1 10 20 30 40"
                      required
                      style={{
                        borderColor: validationErrors.has("concurrency") ? "#f87171" : undefined,
                      }}
                    />
                  </label>

                  <label>
                    请求数 *
                    <input
                      type="text"
                      value={form.request_number || ""}
                      onChange={(e) => {
                        updateForm("request_number", e.target.value);
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("request_number");
                            return next;
                          });
                        }
                      }}
                      onBlur={(e) => updateForm("request_number", e.target.value.trim())}
                      placeholder="例如: 100 或 10 50 100 200"
                      required
                      style={{
                        borderColor: validationErrors.has("request_number") ? "#f87171" : undefined,
                      }}
                    />
                  </label>

                  <label>
                    测试轮次
                    <input
                      type="number"
                      value={form.loop === undefined ? "" : form.loop}
                      onChange={(e) => updateForm("loop", e.target.value === "" ? undefined : parseInt(e.target.value))}
                      placeholder="默认: 1"
                      min="1"
                    />
                  </label>

                  <label>
                    输入长度 *
                    <input
                      type="number"
                      value={form.input_length}
                      onChange={(e) => {
                        updateForm("input_length", e.target.value === "" ? undefined : parseInt(e.target.value));
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("input_length");
                            return next;
                          });
                        }
                      }}
                      placeholder="例如: 512"
                      required
                      style={{
                        borderColor: validationErrors.has("input_length") ? "#f87171" : undefined,
                      }}
                    />
                  </label>

                  <label>
                    输出长度 *
                    <input
                      type="number"
                      value={form.output_length}
                      onChange={(e) => {
                        updateForm("output_length", e.target.value === "" ? undefined : parseInt(e.target.value));
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("output_length");
                            return next;
                          });
                        }
                      }}
                      placeholder="例如: 512"
                      required
                      style={{
                        borderColor: validationErrors.has("output_length") ? "#f87171" : undefined,
                      }}
                    />
                  </label>

                  <label>
                    测试超时时间（分钟）
                    <input
                      type="number"
                      step="1"
                      value={form.timeout_minutes === undefined ? "" : form.timeout_minutes}
                      onChange={(e) => updateForm("timeout_minutes", e.target.value === "" ? undefined : parseFloat(e.target.value))}
                      placeholder="默认: 30mins"
                    />
                    <small style={{ color: "#666" }}>测试超时时间，超时后任务会被标记为失败</small>
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
                      list="model-suggestions"
                      value={form.model}
                      onChange={(e) => {
                        updateForm("model", e.target.value);
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("model");
                            return next;
                          });
                        }
                      }}
                      placeholder={scannedModels.length > 0 ? "从扫描结果中选择或输入" : "请先扫描远程模型"}
                      required
                      style={{
                        borderColor: validationErrors.has("model") ? "#f87171" : undefined,
                      }}
                    />
                    <datalist id="model-suggestions">
                      {scannedModels.map((model) => (
                        <option key={model.name} value={model.name} />
                      ))}
                    </datalist>
                  </label>

                  <label>
                    Tokenizer 路径
                    <input
                      type="text"
                      value={form.tokenizer_path || ""}
                      onChange={(e) => updateForm("tokenizer_path", e.target.value)}
                      placeholder="可选，默认根据模型名称自动查找"
                    />
                  </label>
                </div>

                {/* 测试选项 */}
                <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>测试选项</h3>
                <div style={{ display: "flex", gap: "2rem", marginTop: "0.5rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexDirection: "row" }}>
                    <input
                      type="checkbox"
                      checked={form.warmup}
                      onChange={(e) => updateForm("warmup", e.target.checked)}
                    />
                    <span>Warmup</span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexDirection: "row" }}>
                    <input
                      type="checkbox"
                      checked={form.debug || false}
                      onChange={(e) => updateForm("debug", e.target.checked)}
                    />
                    <span>Debug 模式</span>
                  </label>
                </div>
                {form.debug && (
                  <small style={{ color: "#ff6b35", marginTop: "0.5rem", display: "block" }}>
                    ⚠️ 开启 Debug 可能会影响性能测试结果
                  </small>
                )}
              </div>
            )}

            {/* FT 配置表单 */}
            {form.scenario === "ft" && (
              <div>
                {/* 连接配置 */}
                <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>连接配置</h3>
                <div className="form-grid">
                  <label>
                    API IP *
                    <input
                      type="text"
                      value={form.amaas_ip || ""}
                      onChange={(e) => {
                        updateForm("amaas_ip", e.target.value);
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("amaas_ip");
                            return next;
                          });
                        }
                      }}
                      placeholder="例如: 192.168.1.100"
                      required
                      style={{
                        borderColor: validationErrors.has("amaas_ip") ? "#f87171" : undefined,
                      }}
                    />
                  </label>

                  <label>
                    API Port *
                    <input
                      type="number"
                      value={form.model_port === undefined ? "" : form.model_port}
                      onChange={(e) => {
                        updateForm("model_port", e.target.value === "" ? undefined : parseInt(e.target.value));
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("model_port");
                            return next;
                          });
                        }
                      }}
                      placeholder="例如: 30000"
                      required
                      style={{
                        borderColor: validationErrors.has("model_port") ? "#f87171" : undefined,
                      }}
                    />
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
                      onChange={(e) => {
                        updateForm("ssh_user", e.target.value);
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("ssh_user");
                            return next;
                          });
                        }
                      }}
                      placeholder="SSH 登录用户名"
                      required
                      style={{
                        borderColor: validationErrors.has("ssh_user") ? "#f87171" : undefined,
                      }}
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

                {/* 测试参数 */}
                <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>测试参数</h3>
                <div className="form-grid">
                  <label>
                    并发度 *
                    <input
                      type="text"
                      value={form.concurrency || ""}
                      onChange={(e) => {
                        updateForm("concurrency", e.target.value);
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("concurrency");
                            return next;
                          });
                        }
                      }}
                      onBlur={(e) => updateForm("concurrency", e.target.value.trim())}
                      placeholder="例如: 4 或 1 10 20 30 40"
                      required
                      style={{
                        borderColor: validationErrors.has("concurrency") ? "#f87171" : undefined,
                      }}
                    />
                  </label>

                  <label>
                    请求数 *
                    <input
                      type="text"
                      value={form.request_number || ""}
                      onChange={(e) => {
                        updateForm("request_number", e.target.value);
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("request_number");
                            return next;
                          });
                        }
                      }}
                      onBlur={(e) => updateForm("request_number", e.target.value.trim())}
                      placeholder="例如: 100 或 10 50 100 200"
                      required
                      style={{
                        borderColor: validationErrors.has("request_number") ? "#f87171" : undefined,
                      }}
                    />
                  </label>

                  <label>
                    测试轮次
                    <input
                      type="number"
                      value={form.loop === undefined ? "" : form.loop}
                      onChange={(e) => updateForm("loop", e.target.value === "" ? undefined : parseInt(e.target.value))}
                      placeholder="默认: 1"
                      min="1"
                    />
                  </label>

                  <label>
                    输入长度 *
                    <input
                      type="number"
                      value={form.input_length}
                      onChange={(e) => {
                        updateForm("input_length", e.target.value === "" ? undefined : parseInt(e.target.value));
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("input_length");
                            return next;
                          });
                        }
                      }}
                      placeholder="例如: 512"
                      required
                      style={{
                        borderColor: validationErrors.has("input_length") ? "#f87171" : undefined,
                      }}
                    />
                  </label>

                  <label>
                    输出长度 *
                    <input
                      type="number"
                      value={form.output_length}
                      onChange={(e) => {
                        updateForm("output_length", e.target.value === "" ? undefined : parseInt(e.target.value));
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("output_length");
                            return next;
                          });
                        }
                      }}
                      placeholder="例如: 512"
                      required
                      style={{
                        borderColor: validationErrors.has("output_length") ? "#f87171" : undefined,
                      }}
                    />
                  </label>

                  <label>
                    测试超时时间（分钟）
                    <input
                      type="number"
                      step="1"
                      value={form.timeout_minutes === undefined ? "" : form.timeout_minutes}
                      onChange={(e) => updateForm("timeout_minutes", e.target.value === "" ? undefined : parseFloat(e.target.value))}
                      placeholder="默认: 30mins"
                    />
                    <small style={{ color: "#666" }}>测试超时时间，超时后任务会被标记为失败</small>
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
                      list="model-suggestions-ft"
                      value={form.model}
                      onChange={(e) => {
                        updateForm("model", e.target.value);
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("model");
                            return next;
                          });
                        }
                      }}
                      placeholder={scannedModels.length > 0 ? "从扫描结果中选择或输入" : "请先扫描远程模型"}
                      required
                      style={{
                        borderColor: validationErrors.has("model") ? "#f87171" : undefined,
                      }}
                    />
                    <datalist id="model-suggestions-ft">
                      {scannedModels.map((model) => (
                        <option key={model.name} value={model.name} />
                      ))}
                    </datalist>
                  </label>

                  <label>
                    Tokenizer 路径
                    <input
                      type="text"
                      value={form.tokenizer_path || ""}
                      onChange={(e) => updateForm("tokenizer_path", e.target.value)}
                      placeholder="可选，默认根据模型名称自动查找"
                    />
                  </label>
                </div>

                {/* 测试选项 */}
                <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>测试选项</h3>
                <div style={{ display: "flex", gap: "2rem", marginTop: "0.5rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexDirection: "row" }}>
                    <input
                      type="checkbox"
                      checked={form.warmup}
                      onChange={(e) => updateForm("warmup", e.target.checked)}
                    />
                    <span>Warmup</span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexDirection: "row" }}>
                    <input
                      type="checkbox"
                      checked={form.debug || false}
                      onChange={(e) => updateForm("debug", e.target.checked)}
                    />
                    <span>Debug 模式</span>
                  </label>
                </div>
                {form.debug && (
                  <small style={{ color: "#ff6b35", marginTop: "0.5rem", display: "block" }}>
                    ⚠️ 开启 Debug 可能会影响性能测试结果
                  </small>
                )}
              </div>
            )}

            {/* 操作按钮 */}
            <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
              <button
                onClick={async () => {
                  // Validate all required fields
                  const validation = validatePerfTestForm();
                  if (!validation.isValid) {
                    setValidationErrors(validation.errors);
                    setError(validation.message);
                    return;
                  }

                  setValidationErrors(new Set());
                  setLoading(true);
                  setMessage(null);
                  setError(null);
                  try {
                    const payload = {
                      base: form.scenario as "amaas" | "ft",
                      skip_launch: true,
                      ip: form.amaas_ip || "",
                      port: form.scenario === "amaas" ? 10011 : form.model_port,
                      model: form.model,
                      tokenizer_path: form.tokenizer_path || undefined,
                      ssh_user: form.ssh_user || "",
                      ssh_password: form.ssh_password || undefined,
                      ssh_port: form.ssh_port || 22,
                      parallel: form.concurrency || "1",
                      number: form.request_number || "100",
                      input_length: form.input_length,
                      output_length: form.output_length,
                      loop: form.loop || 1,
                      debug: form.debug || false,
                      warmup: form.warmup,
                      keep_model: true,
                      tp: form.model_tp || 1,
                      appauto_branch: form.appauto_branch || "main",
                      timeout_minutes: form.timeout_minutes,
                    };

                    const response = await runPerfTest(payload);
                    setMessage(
                      `任务 ${response.task_id} 已创建（并发 ${response.concurrency}）`,
                    );
                    await loadTasks();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "启动失败");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                {loading ? "测试中..." : "开始测试"}
              </button>
            </div>

        {/* 消息显示 */}
        {message && <div className="success" style={{ marginTop: "1rem" }}>{message}</div>}
        {error && <div className="error" style={{ marginTop: "1rem" }}>{error}</div>}
      </CollapsiblePanel>

      {/* 第二个可折叠菜单：拉起模型并测试 */}
      <div style={{ marginTop: "1rem" }}>
        <CollapsiblePanel
          id="launch-model"
          title="拉起模型并进行性能测试"
          icon="🚀"
          isExpanded={expandedSection === "launch-model"}
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
                    name="scenario-launch"
                    value="ft"
                    checked={form.scenario === "ft"}
                    onChange={(e) => updateForm("scenario", e.target.value as "ft" | "amaas")}
                  />
                  <span>基于 FT</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="radio"
                    name="scenario-launch"
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
                  list="appauto-branch-suggestions-perf-launch"
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
                <datalist id="appauto-branch-suggestions-perf-launch">
                  {appautoBranches.map((branch) => (
                    <option key={branch} value={branch} />
                  ))}
                </datalist>
                <small style={{ color: "#666" }}>指定 appauto 的 git 分支版本</small>
              </label>
            </div>

            {/* AMaaS API 配置（仅在 AMaaS 场景显示） */}
            {form.scenario === "amaas" && (
              <>
                <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>AMaaS API 配置</h3>
                <div className="form-grid">
                  <label>
                    AMaaS API 端口 *
                    <input
                      type="number"
                      value={form.amaas_api_port === undefined ? "" : form.amaas_api_port}
                      onChange={(e) => {
                        updateForm("amaas_api_port", e.target.value === "" ? undefined : parseInt(e.target.value));
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("amaas_api_port");
                            return next;
                          });
                        }
                      }}
                      placeholder="例如: 10001"
                      min="1024"
                      max="65535"
                      required
                      style={{
                        borderColor: validationErrors.has("amaas_api_port") ? "#f87171" : undefined,
                      }}
                    />
                  </label>

                  <label>
                    AMaaS 用户名
                    <input
                      type="text"
                      value={form.amaas_api_user || "admin"}
                      onChange={(e) => updateForm("amaas_api_user", e.target.value)}
                      placeholder="默认: admin"
                    />
                  </label>

                  <label>
                    AMaaS 密码 *
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <input
                        type={showPassword.amaas ? "text" : "password"}
                        value={form.amaas_api_passwd || ""}
                        onChange={(e) => {
                          updateForm("amaas_api_passwd", e.target.value);
                          if (e.target.value) {
                            setValidationErrors(prev => {
                              const next = new Set(prev);
                              next.delete("amaas_api_passwd");
                              return next;
                            });
                          }
                        }}
                        placeholder="AMaaS API 密码"
                        required
                        style={{
                          flex: 1,
                          paddingRight: "2.5rem",
                          borderColor: validationErrors.has("amaas_api_passwd") ? "#f87171" : undefined,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(prev => ({ ...prev, amaas: !prev.amaas }))}
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
                        title={showPassword.amaas ? "隐藏密码" : "显示密码"}
                      >
                        {showPassword.amaas ? "隐藏" : "显示"}
                      </button>
                    </div>
                  </label>
                </div>
              </>
            )}

            {/* SSH 配置 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>SSH 配置</h3>
            <div className="form-grid">
              <label>
                SSH 主机 *
                <input
                  type="text"
                  value={form.amaas_ip || ""}
                  onChange={(e) => {
                    updateForm("amaas_ip", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("amaas_ip");
                        return next;
                      });
                    }
                  }}
                  placeholder="例如: 192.168.1.100"
                  required
                  style={{
                    borderColor: validationErrors.has("amaas_ip") ? "#f87171" : undefined,
                  }}
                />
              </label>

              <label>
                SSH 用户 *
                <input
                  type="text"
                  value={form.ssh_user || ""}
                  onChange={(e) => {
                    updateForm("ssh_user", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("ssh_user");
                        return next;
                      });
                    }
                  }}
                  placeholder="SSH 登录用户名"
                  required
                  style={{
                    borderColor: validationErrors.has("ssh_user") ? "#f87171" : undefined,
                  }}
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
                  list="model-names-launch"
                  value={form.model || ""}
                  onChange={(e) => {
                    updateForm("model", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("model");
                        return next;
                      });
                    }
                  }}
                  placeholder={scannedModels.length > 0 ? "从扫描结果中选择或输入" : "请先扫描远程模型"}
                  required
                  style={{
                    borderColor: validationErrors.has("model") ? "#f87171" : undefined,
                  }}
                />
                <datalist id="model-names-launch">
                  {scannedModels.map((model) => (
                    <option key={model.name} value={model.name} />
                  ))}
                </datalist>
              </label>

              <label>
                TP (Tensor Parallelism) *
                <select
                  value={form.model_tp}
                  onChange={(e) => {
                    updateForm("model_tp", parseInt(e.target.value));
                    setValidationErrors(prev => {
                      const next = new Set(prev);
                      next.delete("model_tp");
                      return next;
                    });
                  }}
                  required
                  style={{
                    borderColor: validationErrors.has("model_tp") ? "#f87171" : undefined,
                  }}
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

              {/* 模型端口仅在 FT 场景显示 */}
              {form.scenario === "ft" && (
                <label>
                  模型端口 *
                  <input
                    type="number"
                    value={form.model_port === undefined ? "" : form.model_port}
                    onChange={(e) => {
                      updateForm("model_port", e.target.value === "" ? undefined : parseInt(e.target.value));
                      if (e.target.value) {
                        setValidationErrors(prev => {
                          const next = new Set(prev);
                          next.delete("model_port");
                          return next;
                        });
                      }
                    }}
                    placeholder="例如: 30000"
                    min="1024"
                    max="65535"
                    required
                    style={{
                      borderColor: validationErrors.has("model_port") ? "#f87171" : undefined,
                    }}
                  />
                </label>
              )}
            </div>

            {/* 测试参数 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>测试参数</h3>
            <div className="form-grid">
              <label>
                并发度 *
                <input
                  type="text"
                  value={form.concurrency || ""}
                  onChange={(e) => {
                    updateForm("concurrency", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("concurrency");
                        return next;
                      });
                    }
                  }}
                  onBlur={(e) => updateForm("concurrency", e.target.value.trim())}
                  placeholder="例如: 4 或 1 10 20 30 40"
                  required
                  style={{
                    borderColor: validationErrors.has("concurrency") ? "#f87171" : undefined,
                  }}
                />
              </label>

              <label>
                请求数 *
                <input
                  type="text"
                  value={form.request_number || ""}
                  onChange={(e) => {
                    updateForm("request_number", e.target.value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("request_number");
                        return next;
                      });
                    }
                  }}
                  onBlur={(e) => updateForm("request_number", e.target.value.trim())}
                  placeholder="例如: 100 或 10 50 100 200"
                  required
                  style={{
                    borderColor: validationErrors.has("request_number") ? "#f87171" : undefined,
                  }}
                />
              </label>

              <label>
                测试轮次
                <input
                  type="number"
                  value={form.loop === undefined ? "" : form.loop}
                  onChange={(e) => updateForm("loop", e.target.value === "" ? undefined : parseInt(e.target.value))}
                  placeholder="默认: 1"
                  min="1"
                />
              </label>

              <label>
                输入长度 *
                <input
                  type="number"
                  value={form.input_length}
                  onChange={(e) => {
                    updateForm("input_length", e.target.value === "" ? undefined : parseInt(e.target.value));
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("input_length");
                        return next;
                      });
                    }
                  }}
                  placeholder="例如: 512"
                  required
                  style={{
                    borderColor: validationErrors.has("input_length") ? "#f87171" : undefined,
                  }}
                />
              </label>

              <label>
                输出长度 *
                <input
                  type="number"
                  value={form.output_length}
                  onChange={(e) => {
                    const value = e.target.value === "" ? undefined : Number(e.target.value);
                    updateForm("output_length", value);
                    if (e.target.value) {
                      setValidationErrors(prev => {
                        const next = new Set(prev);
                        next.delete("output_length");
                        return next;
                      });
                    }
                  }}
                  placeholder="例如: 512"
                  required
                  style={{
                    borderColor: validationErrors.has("output_length") ? "#f87171" : undefined,
                  }}
                />
              </label>

              <label>
                测试超时时间（分钟）
                <input
                  type="number"
                  step="1"
                  value={form.timeout_minutes === undefined ? "" : form.timeout_minutes}
                  onChange={(e) => updateForm("timeout_minutes", e.target.value === "" ? undefined : parseFloat(e.target.value))}
                  placeholder="默认: 30mins"
                />
                <small style={{ color: "#666" }}>测试超时时间，超时后任务会被标记为失败</small>
              </label>
            </div>

            {/* 测试选项 */}
            <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>测试选项</h3>
            <div style={{ display: "flex", gap: "2rem", marginTop: "0.5rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexDirection: "row" }}>
                <input
                  type="checkbox"
                  checked={form.warmup}
                  onChange={(e) => updateForm("warmup", e.target.checked)}
                />
                <span>Warmup</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexDirection: "row" }}>
                <input
                  type="checkbox"
                  checked={form.keep_model || false}
                  onChange={(e) => updateForm("keep_model", e.target.checked)}
                />
                <span>测试后保持模型运行</span>
              </label>
            </div>

            {/* 操作按钮 */}
            <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
              <button
                onClick={async () => {
                  // Validate all required fields using the launch test form validation
                  const validation = validateLaunchTestForm();
                  if (!validation.isValid) {
                    setValidationErrors(validation.errors);
                    setError(validation.message);
                    return;
                  }

                  setValidationErrors(new Set());
                  setLoading(true);
                  setMessage(null);
                  setError(null);
                  try {
                    const payload: any = {
                      base: form.scenario as "amaas" | "ft",
                      skip_launch: false,
                      ip: form.amaas_ip || "",
                      port: form.scenario === "amaas" ? (form.amaas_api_port || 10001) : form.model_port,
                      model: form.model,
                      tokenizer_path: form.tokenizer_path || undefined,
                      ssh_user: form.ssh_user || "",
                      ssh_password: form.ssh_password || undefined,
                      ssh_port: form.ssh_port || 22,
                      parallel: form.concurrency || "1",
                      number: form.request_number || "100",
                      input_length: form.input_length,
                      output_length: form.output_length,
                      loop: form.loop || 1,
                      debug: form.debug || false,
                      warmup: form.warmup,
                      keep_model: form.keep_model || false,
                      tp: form.model_tp || 1,
                      appauto_branch: form.appauto_branch || "main",
                      timeout_minutes: form.timeout_minutes,
                    };

                    // FT 场景需要额外参数
                    if (form.scenario === "ft") {
                      payload.launch_timeout = form.launch_timeout || 900;
                    } else if (form.scenario === "amaas") {
                      // AMaaS 场景需要 API 认证参数
                      payload.amaas_api_user = form.amaas_api_user || "admin";
                      payload.amaas_api_passwd = form.amaas_api_passwd;
                      payload.launch_timeout = form.launch_timeout || 900;
                    }

                    const response = await runPerfTest(payload);
                    setMessage(
                      `任务 ${response.task_id} 已创建，模型将自动启动`,
                    );
                    await loadTasks();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "启动失败");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                {loading ? "启动中..." : "拉起模型并测试"}
              </button>
            </div>

            {/* 消息显示 */}
            {message && <div className="success" style={{ marginTop: "1rem" }}>{message}</div>}
            {error && <div className="error" style={{ marginTop: "1rem" }}>{error}</div>}
        </CollapsiblePanel>
      </div>

      {/* 性能测试任务列表 */}
      <section className="panel" style={{ marginTop: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0 }}>任务列表</h2>
          <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
            本页任务共计 {tasks.filter(t => t.engine === "evalscope" && !t.parameters?.dataset).length} 条
          </span>
        </div>
        <TaskTable
          tasks={tasks.filter(t => t.engine === "evalscope" && !t.parameters?.dataset)}
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
          emptyMessage="暂无性能测试任务"
        />

        {/* Pagination controls */}
        <Pagination
          currentPage={perfPagination.currentPage}
          totalPages={perfPagination.totalPages}
          onPageChange={perfPagination.setCurrentPage}
        />
      </section>
    </div>
  );
}
