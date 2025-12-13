import { useEffect, useMemo, useRef, useState } from "react";
import {
  API_BASE,
  archiveTask,
  cancelTask,
  collectHardwareInfo,
  deleteTask,
  downloadUrl,
  fetchAppautoBranches,
  fetchProfile,
  fetchTasks,
  fetchTaskLogs,
  getAuthToken,
  getAppautoVersions,
  listUsers,
  loginUser,
  registerUser,
  retryTask,
  runTest,
  runPerfTest,
  scanModels,
  setAuthToken,
  updateAppauto,
  updateUserRole,
  resetUserPassword,
  deleteUser,
  batchDeleteUsers,
  previewResult,
  UserInfo,
} from "./api";
import {
  ModelInfo,
  Profile,
  TaskSummary,
  TestRunForm,
  TestRunResponse,
} from "./types";

const DEFAULT_FORM: TestRunForm = {
  engine: "vllm",
  model: "",
  input_length: 512,
  output_length: 512,
  concurrency: "1 4",
  loop: 1,
  warmup: false,
  execution_mode: "remote",
  scenario: "amaas",
  ssh_config: null,

  // Appauto 版本配置
  appauto_branch: "main",

  // 模型启动配置
  auto_launch_model: false,
  model_config_name: "",
  model_path: "",
  model_tp: 1,
  model_mode: "correct",
  model_port: 30000,
  model_host: "0.0.0.0",
  stop_model_after_test: false,

  // AMaaS 特定配置
  amaas_ip: "",
  amaas_api_port: 10001,
  amaas_api_user: "admin",
  amaas_api_passwd: "123456",
  ssh_user: "",
  ssh_password: "",
  ssh_port: 22,
  request_number: "1 4",
  tokenizer_path: "",
  debug: false,
};

function App() {
  const [form, setForm] = useState<TestRunForm>(DEFAULT_FORM);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"basic" | "performance" | "correctness" | "others" | "system">("performance");
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("theme");
    return (saved as "dark" | "light") || "dark";
  });
  const [expandedSection, setExpandedSection] = useState<string | null>("existing-model");
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [currentLogs, setCurrentLogs] = useState<string>("");
  const [logsTaskId, setLogsTaskId] = useState<number | null>(null);
  const logsTaskIdRef = useRef<number | null>(null);

  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);

  // Password visibility state
  const [showPassword, setShowPassword] = useState({
    auth: false,
    ssh: false,
    amaas: false,
  });

  // Hardware info collection form state
  const [sshHost, setSshHost] = useState("");
  const [sshUser, setSshUser] = useState("");
  const [sshPassword, setSshPassword] = useState("");
  const [sshPort, setSshPort] = useState("22");
  const [showSshPassword, setShowSshPassword] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // Form validation state
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());

  // Model scanning state
  const [scannedModels, setScannedModels] = useState<ModelInfo[]>([]);
  const [scanningModels, setScanningModels] = useState(false);

  // Appauto branch state
  const [appautoBranches, setAppautoBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Others tasks state (hardware_info, etc.)
  const [othersTasks, setOthersTasks] = useState<TaskSummary[]>([]);
  const [othersCurrentPage, setOthersCurrentPage] = useState(1);
  const [othersTotalTasks, setOthersTotalTasks] = useState(0);
  const [othersTotalPages, setOthersTotalPages] = useState(0);

  // System management state
  const [systemTasks, setSystemTasks] = useState<TaskSummary[]>([]);
  const [systemCurrentPage, setSystemCurrentPage] = useState(1);
  const [systemTotalTasks, setSystemTotalTasks] = useState(0);
  const [systemTotalPages, setSystemTotalPages] = useState(0);
  const [appautoVersions, setAppautoVersions] = useState<any[]>([]);
  const [appautoPath, setAppautoPath] = useState<string>("");
  const [updateBranch, setUpdateBranch] = useState<string>("main");

  // User management state
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalTasks, setTotalTasks] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  useEffect(() => {
    if (!getAuthToken()) {
      return;
    }
    fetchProfile()
      .then((data) => setProfile(data))
      .catch(() => {
        setAuthToken(null);
      });
  }, []);

  // Load appauto branches when authenticated
  useEffect(() => {
    if (!profile) return;
    loadAppautoBranches();
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    loadTasks();
    const timer = setInterval(loadTasks, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, currentPage]);

  useEffect(() => {
    if (!profile) return;
    loadOthersTasks();
    const timer = setInterval(loadOthersTasks, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, othersCurrentPage]);

  useEffect(() => {
    if (!profile) return;
    loadSystemTasks();
    loadAppautoVersions();
    loadUsers();
    const timer = setInterval(loadSystemTasks, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, systemCurrentPage]);

  const summaryColumns = useMemo(
    () => [
      { key: "avg_latency", label: "Avg Latency" },
      { key: "p95", label: "P95" },
      { key: "error_rate", label: "Error Rate" },
      { key: "throughput_token_s", label: "Tokens/s" },
    ],
    [],
  );

  async function loadTasks() {
    if (!profile) return;
    try {
      const data = await fetchTasks({
        page: currentPage,
        page_size: pageSize,
        // 移除 task_type 过滤，加载所有任务（包括 pytest 和 perf_test）
      });
      setTasks(data.items);
      setTotalTasks(data.total);
      setTotalPages(data.total_pages);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadOthersTasks() {
    if (!profile) return;
    try {
      const data = await fetchTasks({
        page: othersCurrentPage,
        page_size: pageSize,
        task_type: "hardware_info"
      });
      setOthersTasks(data.items);
      setOthersTotalTasks(data.total);
      setOthersTotalPages(data.total_pages);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadSystemTasks() {
    if (!profile) return;
    try {
      const data = await fetchTasks({
        page: systemCurrentPage,
        page_size: pageSize,
        task_type: "system_maintenance"
      });
      setSystemTasks(data.items);
      setSystemTotalTasks(data.total);
      setSystemTotalPages(data.total_pages);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadAppautoVersions() {
    if (!profile) return;
    try {
      const data = await getAppautoVersions();
      setAppautoVersions(data.versions);
      setAppautoPath(data.appauto_path);
    } catch (err) {
      console.error(err);
      // If getting versions fails (e.g., not admin), silently fail
    }
  }

  async function loadUsers() {
    if (!profile || profile.role !== "admin") return;
    setLoadingUsers(true);
    try {
      const data = await listUsers();
      setUsers(data.users);
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function handleUpdateUserRole(userId: number, newRole: string) {
    if (!profile || profile.role !== "admin") return;

    try {
      await updateUserRole(userId, newRole);
      // Reload users after updating
      await loadUsers();
      alert(`用户角色已更新为: ${newRole}`);
    } catch (err: any) {
      console.error("Failed to update user role:", err);
      const errorMessage = err.message || "更新用户角色失败";
      if (errorMessage.includes("cannot_modify_own_role")) {
        alert("不能修改自己的角色");
      } else {
        alert(`更新失败: ${errorMessage}`);
      }
    }
  }

  async function handleDeleteUser(userId: number, userEmail: string) {
    if (!profile || profile.role !== "admin") return;

    if (!window.confirm(`确定要删除用户 ${userEmail} 吗？此操作不可恢复！`)) {
      return;
    }

    try {
      await deleteUser(userId);
      await loadUsers();
      setSelectedUserIds(new Set());
      alert(`用户 ${userEmail} 已删除`);
    } catch (err: any) {
      console.error("Failed to delete user:", err);
      const errorMessage = err.message || "删除用户失败";
      if (errorMessage.includes("cannot_delete_self")) {
        alert("不能删除自己");
      } else {
        alert(`删除失败: ${errorMessage}`);
      }
    }
  }

  async function handleResetPassword(userId: number, email: string, newPassword: string) {
    if (!profile || profile.role !== "admin") return;

    try {
      const result = await resetUserPassword(userId, newPassword);
      alert(result.message);
      await loadUsers();
    } catch (err: any) {
      console.error("Failed to reset password:", err);
      const errorMessage = err.message || "重置密码失败";
      if (errorMessage.includes("password_too_short")) {
        alert("密码长度至少为8位");
      } else if (errorMessage.includes("user_not_found")) {
        alert("用户不存在");
      } else {
        alert(`重置密码失败: ${errorMessage}`);
      }
    }
  }

  async function handleBatchDeleteUsers() {
    if (!profile || profile.role !== "admin") return;
    if (selectedUserIds.size === 0) {
      alert("请先选择要删除的用户");
      return;
    }

    const userIdsArray = Array.from(selectedUserIds);
    const selectedUsers = users.filter(u => userIdsArray.includes(u.id));
    const userEmails = selectedUsers.map(u => u.email).join(", ");

    if (!window.confirm(`确定要删除以下 ${selectedUserIds.size} 个用户吗？\n${userEmails}\n\n此操作不可恢复！`)) {
      return;
    }

    try {
      const result = await batchDeleteUsers(userIdsArray);
      await loadUsers();
      setSelectedUserIds(new Set());
      alert(result.message);
    } catch (err: any) {
      console.error("Failed to batch delete users:", err);
      const errorMessage = err.message || "批量删除用户失败";
      if (errorMessage.includes("cannot_delete_self")) {
        alert("不能删除自己");
      } else {
        alert(`删除失败: ${errorMessage}`);
      }
    }
  }

  function toggleUserSelection(userId: number) {
    setSelectedUserIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  }

  function toggleSelectAll() {
    if (selectedUserIds.size === users.filter(u => u.id !== profile?.user_id).length) {
      // All selectable users are selected, deselect all
      setSelectedUserIds(new Set());
    } else {
      // Select all users except current user
      const selectableIds = users
        .filter(u => u.id !== profile?.user_id)
        .map(u => u.id);
      setSelectedUserIds(new Set(selectableIds));
    }
  }

  async function loadAppautoBranches() {
    if (!profile) return;
    setLoadingBranches(true);
    try {
      const data = await fetchAppautoBranches();
      setAppautoBranches(data.branches);
    } catch (err) {
      console.error("Failed to load appauto branches:", err);
      setError("无法加载 appauto 分支列表");
    } finally {
      setLoadingBranches(false);
    }
  }

  function updateForm<K extends keyof TestRunForm>(
    key: K,
    value: TestRunForm[K],
  ) {
    // 当 IP 相关字段或 SSH 用户变化时，清空已扫描的模型列表和已选择的模型名称
    // 因为不同环境/主机上的模型可能不同，需要重新扫描
    if (key === "amaas_ip" || key === "ssh_user") {
      console.log(`[updateForm] Clearing scanned models and selected model due to ${key} change: ${value}`);
      setScannedModels([]);
      setForm((prev) => ({ ...prev, [key]: value, model: "" }));
    } else {
      setForm((prev) => ({ ...prev, [key]: value }));
    }
  }

  function validatePerfTestForm(): { isValid: boolean; errors: Set<string>; message: string } {
    const errors = new Set<string>();
    const errorMessages: string[] = [];

    // Common required fields
    if (!form.amaas_ip) {
      errors.add("amaas_ip");
      errorMessages.push(form.scenario === "amaas" ? "AMaaS IP" : "API IP");
    }
    if (!form.ssh_user) {
      errors.add("ssh_user");
      errorMessages.push("SSH 用户");
    }
    if (!form.concurrency) {
      errors.add("concurrency");
      errorMessages.push("并发度");
    }
    if (!form.request_number) {
      errors.add("request_number");
      errorMessages.push("请求数");
    }
    if (!form.input_length) {
      errors.add("input_length");
      errorMessages.push("输入长度");
    }
    if (!form.output_length) {
      errors.add("output_length");
      errorMessages.push("输出长度");
    }
    if (!form.model) {
      errors.add("model");
      errorMessages.push("模型名称");
    }
    if (!form.appauto_branch) {
      errors.add("appauto_branch");
      errorMessages.push("Appauto 分支");
    }

    // Scenario-specific required fields
    if (form.scenario === "amaas") {
      if (!form.amaas_api_passwd) {
        errors.add("amaas_api_passwd");
        errorMessages.push("AMaaS 密码");
      }
    } else if (form.scenario === "ft") {
      if (!form.model_port) {
        errors.add("model_port");
        errorMessages.push("API Port");
      }
    }

    const message = errorMessages.length > 0
      ? `请填写以下必填项：${errorMessages.join("、")}`
      : "";

    return {
      isValid: errors.size === 0,
      errors,
      message,
    };
  }

  function validateLaunchTestForm(): { isValid: boolean; errors: Set<string>; message: string } {
    const errors = new Set<string>();
    const errorMessages: string[] = [];

    // SSH 配置
    if (!form.amaas_ip) {
      errors.add("amaas_ip");
      errorMessages.push("SSH 主机");
    }
    if (!form.ssh_user) {
      errors.add("ssh_user");
      errorMessages.push("SSH 用户");
    }

    // 模型配置
    if (!form.model) {
      errors.add("model");
      errorMessages.push("模型名称");
    }

    // TP 是必填项
    if (!form.model_tp) {
      errors.add("model_tp");
      errorMessages.push("TP");
    }

    // 测试参数
    if (!form.concurrency) {
      errors.add("concurrency");
      errorMessages.push("并发度");
    }
    if (!form.request_number) {
      errors.add("request_number");
      errorMessages.push("请求数");
    }
    if (!form.input_length) {
      errors.add("input_length");
      errorMessages.push("输入长度");
    }
    if (!form.output_length) {
      errors.add("output_length");
      errorMessages.push("输出长度");
    }
    if (!form.appauto_branch) {
      errors.add("appauto_branch");
      errorMessages.push("Appauto 分支");
    }

    // 场景特定字段
    if (form.scenario === "amaas") {
      if (!form.amaas_api_passwd) {
        errors.add("amaas_api_passwd");
        errorMessages.push("AMaaS 密码");
      }
      if (!form.amaas_api_port) {
        errors.add("amaas_api_port");
        errorMessages.push("AMaaS API 端口");
      }
    } else if (form.scenario === "ft") {
      if (!form.model_port) {
        errors.add("model_port");
        errorMessages.push("模型端口");
      }
    }

    const message = errorMessages.length > 0
      ? `请填写以下必填项：${errorMessages.join("、")}`
      : "";

    return {
      isValid: errors.size === 0,
      errors,
      message,
    };
  }

  async function handleScanModels() {
    // 检查必需的 SSH 配置
    if (!form.amaas_ip || !form.ssh_user) {
      setError("请先填写 SSH 配置（主机和用户）");
      return;
    }

    setScanningModels(true);
    setError(null);
    try {
      const response = await scanModels({
        ssh_config: {
          host: form.amaas_ip,
          port: form.ssh_port || 22,
          user: form.ssh_user,
          auth_type: form.ssh_password ? "password" : "key",
          password: form.ssh_password || undefined,
          timeout: 30,
        },
        base_dir: "/mnt/data/models",
        include_hidden: false,
      });

      setScannedModels(response.models);
      setMessage(`成功扫描到 ${response.total} 个模型`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "扫描模型失败");
      setScannedModels([]);
    } finally {
      setScanningModels(false);
    }
  }

  async function handleRunTest() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const response: TestRunResponse = await runTest(form);
      setMessage(
        `任务 ${response.task_id} 已创建（并发 ${response.concurrency}）`,
      );
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "启动失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive(taskId: number) {
    setError(null);
    try {
      await archiveTask(taskId);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "归档失败");
    }
  }

  async function handleDelete(taskId: number) {
    setError(null);
    try {
      await deleteTask(taskId);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  async function handleCancel(taskId: number) {
    setError(null);
    try {
      const response = await cancelTask(taskId);
      if (response.cancelled) {
        await loadTasks();
      } else {
        setError(response.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "取消失败");
    }
  }

  async function handleAuthSubmit() {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const payload = { ...authForm };
      const fn = authMode === "login" ? loginUser : registerUser;
      const resp = await fn(payload);
      setAuthToken(resp.token);
      const profileResp = await fetchProfile();
      setProfile(profileResp);
      setAuthForm({ email: "", password: "" });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    setAuthToken(null);
    setProfile(null);
    setTasks([]);
  }

  async function handleViewLogs(taskId: number) {
    setError(null);
    // Update the ref immediately to prevent any race conditions
    logsTaskIdRef.current = taskId;
    // Clear old logs first to prevent showing stale data
    setCurrentLogs("");
    setLogsTaskId(taskId);
    setShowLogsModal(true);

    try {
      const response = await fetchTaskLogs(taskId);
      // Only update if this is still the current task
      if (logsTaskIdRef.current === taskId) {
        setCurrentLogs(response.logs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取日志失败");
    }
  }

  async function handlePreview(taskId: number) {
    setError(null);
    setPreviewLoading(true);
    setShowPreviewModal(true);
    setPreviewData(null);
    setCurrentSheetIndex(0);

    try {
      const response = await previewResult(taskId);
      setPreviewData(response);
    } catch (err) {
      // 在弹窗中显示错误，不要立即关闭
      setPreviewData({ error: err instanceof Error ? err.message : "获取预览数据失败" });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleRetry(taskId: number) {
    setError(null);
    setMessage(null);
    try {
      const response = await retryTask(taskId);
      setMessage(`任务 ${taskId} 已重新提交，新任务 ID: ${response.new_task_id}`);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "重试失败");
    }
  }

  if (!profile) {
    return (
      <div className="cover-page">
        <div className="hero">
          <p className="eyebrow">LLM Performance Test Platform</p>
          <h1>一站式大模型压测平台</h1>
          <p className="subhead">
            可配置输入输出、自动探测并发，生成 Excel 报告并支持归档/下载。
          </p>
          <div className="cover-actions">
            <button
              className={authMode === "login" ? "" : "secondary"}
              onClick={() => setAuthMode("login")}
            >
              登录
            </button>
            <button
              className={authMode === "register" ? "" : "secondary"}
              onClick={() => setAuthMode("register")}
            >
              注册
            </button>
          </div>
        </div>

        <div className="auth-card">
          <h2>{authMode === "login" ? "登录账户" : "创建新账户"}</h2>
          <label>
            邮箱
            <input
              type="email"
              value={authForm.email}
              onChange={(e) =>
                setAuthForm((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder="example@company.com"
            />
          </label>
          <label>
            密码
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                type={showPassword.auth ? "text" : "password"}
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="至少 8 位字符"
                style={{ flex: 1, paddingRight: "2.5rem" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => ({ ...prev, auth: !prev.auth }))}
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
                title={showPassword.auth ? "隐藏密码" : "显示密码"}
              >
                {showPassword.auth ? "隐藏" : "显示"}
              </button>
            </div>
          </label>
          <button onClick={handleAuthSubmit} disabled={authLoading}>
            {authMode === "login"
              ? authLoading
                ? "登录中..."
                : "登录"
              : authLoading
                ? "注册中..."
                : "注册并进入"}
          </button>
          {authError && <div className="error">{authError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header>
        <div>
          <h1>LLM 性能测试平台</h1>
          <p>欢迎回来，{profile.email}</p>
        </div>
        <div className="header-actions">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button className="secondary" onClick={loadTasks}>
            刷新
          </button>
          <button className="secondary" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </header>

      {/* 标签页切换 */}
      <div className="tabs">
        <button
          className={activeTab === "basic" ? "tab active" : "tab"}
          onClick={() => setActiveTab("basic")}
        >
          基础测试
        </button>
        <button
          className={activeTab === "performance" ? "tab active" : "tab"}
          onClick={() => setActiveTab("performance")}
        >
          性能测试
        </button>
        <button
          className={activeTab === "correctness" ? "tab active" : "tab"}
          onClick={() => setActiveTab("correctness")}
        >
          正确性测试
        </button>
        <button
          className={activeTab === "others" ? "tab active" : "tab"}
          onClick={() => setActiveTab("others")}
        >
          其他任务
        </button>
        {profile?.role === "admin" && (
          <button
            className={activeTab === "system" ? "tab active" : "tab"}
            onClick={() => setActiveTab("system")}
          >
            系统管理
          </button>
        )}
      </div>

      {activeTab === "basic" && (
        <>
          <section className="panel">
            <h2>基础测试 (Pytest)</h2>

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
                placeholder="例如: amaas_ci_sanity_check"
              />
            </label>

            <label>
              模型优先级
              <input
                type="text"
                value={form.model_priority || ""}
                onChange={(e) => updateForm("model_priority", e.target.value)}
                placeholder="例如: DeepSeek-V3,Qwen2.5-72B"
              />
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
                    testpaths: form.testpaths || undefined,
                    case_level: form.case_level || undefined,
                    model_priority: form.model_priority || undefined,
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
        </section>

        {/* 基础测试任务列表 */}
        <section className="panel" style={{ marginTop: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ margin: 0 }}>任务列表</h2>
            {tasks.filter(t => t.engine === "pytest").length > 0 && (
              <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
                共 {tasks.filter(t => t.engine === "pytest").length} 条基础测试任务
              </span>
            )}
          </div>
          {tasks.filter(t => t.engine === "pytest").length === 0 ? (
            <p style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
              暂无基础测试任务
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>UUID</th>
                  <th>引擎</th>
                  <th>模型</th>
                  <th>状态</th>
                  <th>创建者</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.filter(t => t.engine === "pytest").map((task) => (
                  <tr key={task.id}>
                    <td>{task.display_id || task.id}</td>
                    <td>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "0.75rem",
                          color: "#666"
                        }}
                        title={task.uuid}
                      >
                        {task.uuid.substring(0, 8)}
                      </span>
                    </td>
                    <td>{task.engine}</td>
                    <td>{task.model}</td>
                    <td>
                      <span
                        style={{
                          padding: "0.25rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.875rem",
                          fontWeight: "600",
                          backgroundColor:
                            task.status === "completed"
                              ? "#d1f2eb"
                              : task.status === "running"
                              ? "#fff3cd"
                              : task.status === "failed"
                              ? "#f8d7da"
                              : "#e2e3e5",
                          color:
                            task.status === "completed"
                              ? "#0d6832"
                              : task.status === "running"
                              ? "#856404"
                              : task.status === "failed"
                              ? "#721c24"
                              : "#383d41",
                        }}
                      >
                        {task.status}
                      </span>
                    </td>
                    <td>
                      {task.user_email ? (
                        <span style={{
                          color: task.user_id === profile?.user_id ? "#28a745" : "#666",
                          fontWeight: task.user_id === profile?.user_id ? "600" : "normal"
                        }}>
                          {task.user_email}
                        </span>
                      ) : (
                        <span style={{ color: "#999" }}>未知</span>
                      )}
                    </td>
                    <td>{new Date(task.created_at).toLocaleString()}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {task.result_path && (
                          <button
                            className="secondary"
                            onClick={() =>
                              window.open(downloadUrl(task.id), "_blank")
                            }
                          >
                            下载
                          </button>
                        )}
                        {task.result_path && (
                          <button
                            className="secondary"
                            onClick={() => handlePreview(task.id)}
                            style={{ color: "#17a2b8" }}
                          >
                            预览
                          </button>
                        )}
                        {task.result_path && !task.archived_path && (
                          <button
                            className="secondary"
                            onClick={() => handleArchive(task.id)}
                          >
                            归档
                          </button>
                        )}
                        <button
                          className="secondary"
                          onClick={() => handleViewLogs(task.id)}
                          style={{ color: "#007bff" }}
                        >
                          日志
                        </button>
                        <button
                          className="secondary"
                          onClick={() => handleRetry(task.id)}
                          style={{ color: "#28a745" }}
                        >
                          重试
                        </button>
                        {(!task.user_id || task.user_id === profile?.user_id) &&
                         (task.status === "queued" || task.status === "running") && (
                          <button
                            className="secondary"
                            onClick={() => handleCancel(task.id)}
                            style={{ color: "#ff9800" }}
                          >
                            取消
                          </button>
                        )}
                        {(!task.user_id || task.user_id === profile?.user_id) && (
                          <button
                            className="secondary"
                            onClick={() => handleDelete(task.id)}
                            style={{ color: "#dc3545" }}
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        </>
      )}

      {activeTab === "performance" && (
        <div>
          {/* 第一个可折叠菜单：已有运行中模型 */}
          <section className="panel">
            <div
              className="collapsible-header"
              onClick={() =>
                setExpandedSection(
                  expandedSection === "existing-model" ? null : "existing-model"
                )
              }
              style={{
                cursor: "pointer",
                padding: "1rem",
                borderBottom:
                  expandedSection === "existing-model"
                    ? "1px solid #e0e0e0"
                    : "none",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2 style={{ margin: 0 }}>📊 模型已运行，直接进行性能测试</h2>
              <span style={{ fontSize: "1.5rem" }}>
                {expandedSection === "existing-model" ? "▼" : "▶"}
              </span>
            </div>

            {expandedSection === "existing-model" && (
              <div style={{ padding: "1.5rem" }}>
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
              </div>
            )}
          </section>

          {/* 第二个可折叠菜单：拉起模型并测试 */}
          <section className="panel" style={{ marginTop: "1rem" }}>
            <div
              className="collapsible-header"
              onClick={() =>
                setExpandedSection(
                  expandedSection === "launch-model" ? null : "launch-model"
                )
              }
              style={{
                cursor: "pointer",
                padding: "1rem",
                borderBottom:
                  expandedSection === "launch-model"
                    ? "1px solid #e0e0e0"
                    : "none",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2 style={{ margin: 0 }}>🚀 拉起模型并进行性能测试</h2>
              <span style={{ fontSize: "1.5rem" }}>
                {expandedSection === "launch-model" ? "▼" : "▶"}
              </span>
            </div>

            {expandedSection === "launch-model" && (
              <div style={{ padding: "1.5rem" }}>
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
                    TP（Tensor Parallelism）*
                    <input
                      type="number"
                      value={form.model_tp === undefined ? "" : form.model_tp}
                      onChange={(e) => {
                        updateForm("model_tp", e.target.value === "" ? undefined : parseInt(e.target.value));
                        if (e.target.value) {
                          setValidationErrors(prev => {
                            const next = new Set(prev);
                            next.delete("model_tp");
                            return next;
                          });
                        }
                      }}
                      placeholder="例如: 1"
                      min="1"
                      required
                      style={{
                        borderColor: validationErrors.has("model_tp") ? "#f87171" : undefined,
                      }}
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
                      checked={form.stop_model_after_test || false}
                      onChange={(e) => updateForm("stop_model_after_test", e.target.checked)}
                    />
                    <span>测试完成后停止模型</span>
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
                          keep_model: !form.stop_model_after_test,
                          tp: form.model_tp || 1,
                          appauto_branch: form.appauto_branch || "main",
                        };

                        // FT 场景需要额外参数
                        if (form.scenario === "ft") {
                          payload.launch_timeout = 900;
                        } else if (form.scenario === "amaas") {
                          // AMaaS 场景需要 API 认证参数
                          payload.amaas_api_user = form.amaas_api_user || "admin";
                          payload.amaas_api_passwd = form.amaas_api_passwd;
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
              </div>
            )}
          </section>

          {/* 性能测试任务列表 */}
          <section className="panel" style={{ marginTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ margin: 0 }}>任务列表</h2>
              {tasks.filter(t => t.engine !== "pytest").length > 0 && (
                <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
                  本页任务共计 {tasks.filter(t => t.engine !== "pytest").length} 条
                </span>
              )}
            </div>
            {tasks.filter(t => t.engine !== "pytest").length === 0 ? (
              <p style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
                暂无性能测试任务
              </p>
            ) : (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>UUID</th>
                      <th>引擎</th>
                      <th>模型</th>
                      <th>状态</th>
                      <th>创建者</th>
                      <th>创建时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.filter(t => t.engine !== "pytest").map((task) => (
                      <tr key={task.id}>
                        <td>{task.display_id || task.id}</td>
                        <td>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontSize: "0.75rem",
                              color: "#666"
                            }}
                            title={task.uuid}
                          >
                            {task.uuid.substring(0, 8)}
                          </span>
                        </td>
                        <td>{task.engine}</td>
                        <td>{task.model}</td>
                        <td>
                          <span
                            style={{
                              padding: "0.25rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.875rem",
                              fontWeight: "600",
                              backgroundColor:
                                task.status === "completed"
                                  ? "#d1f2eb"
                                  : task.status === "running"
                                  ? "#fff3cd"
                                  : task.status === "failed"
                                  ? "#f8d7da"
                                  : "#e2e3e5",
                              color:
                                task.status === "completed"
                                  ? "#0d6832"
                                  : task.status === "running"
                                  ? "#856404"
                                  : task.status === "failed"
                                  ? "#721c24"
                                  : "#383d41",
                            }}
                          >
                            {task.status}
                          </span>
                        </td>
                        <td>
                          {task.user_email ? (
                            <span style={{
                              color: task.user_id === profile?.user_id ? "#28a745" : "#666",
                              fontWeight: task.user_id === profile?.user_id ? "600" : "normal"
                            }}>
                              {task.user_email}
                            </span>
                          ) : (
                            <span style={{ color: "#999" }}>未知</span>
                          )}
                        </td>
                        <td>{new Date(task.created_at).toLocaleString()}</td>
                        <td>
                          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            {task.result_path && (
                              <button
                                className="secondary"
                                onClick={() =>
                                  window.open(downloadUrl(task.id), "_blank")
                                }
                              >
                                下载
                              </button>
                            )}
                            {task.result_path && (
                              <button
                                className="secondary"
                                onClick={() => handlePreview(task.id)}
                                style={{ color: "#17a2b8" }}
                              >
                                预览
                              </button>
                            )}
                            {task.result_path && !task.archived_path && (
                              <button
                                className="secondary"
                                onClick={() => handleArchive(task.id)}
                              >
                                归档
                              </button>
                            )}
                            <button
                              className="secondary"
                              onClick={() => handleViewLogs(task.id)}
                              style={{ color: "#007bff" }}
                            >
                              日志
                            </button>
                            <button
                              className="secondary"
                              onClick={() => handleRetry(task.id)}
                              style={{ color: "#28a745" }}
                            >
                              重试
                            </button>
                            {/* Only show cancel button if task belongs to current user and is queued/running */}
                            {(!task.user_id || task.user_id === profile?.user_id) &&
                             (task.status === "queued" || task.status === "running") && (
                              <button
                                className="secondary"
                                onClick={() => handleCancel(task.id)}
                                style={{ color: "#ff9800" }}
                              >
                                取消
                              </button>
                            )}
                            {/* Only show delete button if task belongs to current user */}
                            {(!task.user_id || task.user_id === profile?.user_id) && (
                              <button
                                className="secondary"
                                onClick={() => handleDelete(task.id)}
                                style={{ color: "#dc3545" }}
                              >
                                删除
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "1rem",
                    marginTop: "1.5rem",
                    paddingTop: "1rem",
                    borderTop: "1px solid #e0e0e0"
                  }}>
                    <button
                      className="secondary"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      style={{
                        opacity: currentPage === 1 ? 0.5 : 1,
                        cursor: currentPage === 1 ? "not-allowed" : "pointer"
                      }}
                    >
                      上一页
                    </button>
                    <span style={{ color: "#666" }}>
                      第 {currentPage} / {totalPages} 页
                    </span>
                    <button
                      className="secondary"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        opacity: currentPage === totalPages ? 0.5 : 1,
                        cursor: currentPage === totalPages ? "not-allowed" : "pointer"
                      }}
                    >
                      下一页
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {activeTab === "correctness" && (
        <section className="panel">
          <h2>正确性测试</h2>
          <p style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
            正确性测试功能开发中...
          </p>
        </section>
      )}

      {activeTab === "others" && (
        <>
          <section className="panel">
            <h2>其他任务</h2>
            <p style={{ color: "#666", marginBottom: "1.5rem" }}>
              执行其他类型的任务，如硬件信息收集、环境检查等
            </p>

            {/* 硬件信息收集 */}
            <div style={{ marginBottom: "2rem" }}>
              <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>硬件信息收集</h3>
              <p style={{ color: "#666", marginBottom: "1rem", fontSize: "0.9rem" }}>
                收集远程机器的硬件配置信息，包括 GPU、CPU、内存、磁盘、操作系统等，生成 JSON 报告文件。
              </p>

              <div className="form-row" style={{ marginBottom: "1rem" }}>
                <label>
                  SSH 主机地址 *
                  <input
                    type="text"
                    placeholder="例如: 192.168.1.100"
                    value={sshHost}
                    onChange={(e) => setSshHost(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="form-row" style={{ marginBottom: "1rem" }}>
                <label>
                  SSH 用户名 *
                  <input
                    type="text"
                    placeholder="例如: root"
                    value={sshUser}
                    onChange={(e) => setSshUser(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="form-row" style={{ marginBottom: "1rem" }}>
                <label>
                  SSH 密码
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input
                      type={showSshPassword ? "text" : "password"}
                      placeholder="SSH 密码（可选，留空则使用密钥认证）"
                      value={sshPassword}
                      onChange={(e) => setSshPassword(e.target.value)}
                      style={{ flex: 1, paddingRight: "2.5rem" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSshPassword(!showSshPassword)}
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
                      title={showSshPassword ? "隐藏密码" : "显示密码"}
                    >
                      {showSshPassword ? "隐藏" : "显示"}
                    </button>
                  </div>
                </label>
              </div>

              <div className="form-row" style={{ marginBottom: "1rem" }}>
                <label>
                  SSH 端口
                  <input
                    type="number"
                    placeholder="默认: 22"
                    value={sshPort}
                    onChange={(e) => setSshPort(e.target.value)}
                  />
                </label>
              </div>

              <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
                <button
                  onClick={async () => {
                    if (!sshHost || !sshUser) {
                      setError("请填写 SSH 主机地址和用户名");
                      return;
                    }

                    setError(null);
                    setSuccess(null);

                    try {
                      const response = await collectHardwareInfo({
                        ssh_config: {
                          host: sshHost,
                          port: parseInt(sshPort) || 22,
                          user: sshUser,
                          auth_type: sshPassword ? "password" : "key",
                          ...(sshPassword ? { password: sshPassword } : {}),
                          timeout: 30,
                        },
                        timeout: 300,
                      });

                      setSuccess(`硬件信息收集任务已提交（任务 ID: ${response.task_id}），请在任务列表中查看结果`);

                      // 自动刷新其他任务列表
                      await loadOthersTasks();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "提交失败");
                    }
                  }}
                  disabled={!sshHost || !sshUser}
                  style={{
                    opacity: (!sshHost || !sshUser) ? 0.5 : 1,
                    cursor: (!sshHost || !sshUser) ? "not-allowed" : "pointer",
                  }}
                >
                  开始收集
                </button>

                <button
                  onClick={() => {
                    setSshHost("");
                    setSshUser("");
                    setSshPassword("");
                    setSshPort("22");
                    setError(null);
                    setSuccess(null);
                  }}
                  style={{ background: "#6c757d" }}
                >
                  重置
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                padding: "1rem",
                background: "#fee",
                border: "1px solid #fcc",
                borderRadius: "4px",
                color: "#c33",
                marginTop: "1rem"
              }}>
                {error}
              </div>
            )}

            {success && (
              <div style={{
                padding: "1rem",
                background: "#efe",
                border: "1px solid #cfc",
                borderRadius: "4px",
                color: "#3c3",
                marginTop: "1rem"
              }}>
                {success}
              </div>
            )}
          </section>

          {/* 其他任务列表 */}
          <section className="panel">
            <h2>其他任务列表</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>状态</th>
                    <th>任务类型</th>
                    <th>创建者</th>
                    <th>创建时间</th>
                    <th>完成时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {othersTasks.map((task) => (
                    <tr key={task.id}>
                      <td>{task.display_id || task.id}</td>
                      <td>
                        <span
                          className={`status-badge status-${task.status.toLowerCase()}`}
                        >
                          {task.status}
                        </span>
                      </td>
                      <td>{task.parameters?.task_type || "hardware_info"}</td>
                      <td>
                        {task.user_email ? (
                          <span style={{
                            color: task.user_id === profile?.user_id ? "#28a745" : "#666",
                            fontWeight: task.user_id === profile?.user_id ? "600" : "normal"
                          }}>
                            {task.user_email}
                          </span>
                        ) : (
                          <span style={{ color: "#999" }}>未知</span>
                        )}
                      </td>
                      <td>{new Date(task.created_at).toLocaleString()}</td>
                      <td>
                        {task.completed_at
                          ? new Date(task.completed_at).toLocaleString()
                          : "-"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          {task.result_path && (
                            <button
                              className="secondary"
                              onClick={() =>
                                window.open(downloadUrl(task.id), "_blank")
                              }
                            >
                              下载
                            </button>
                          )}
                          {task.result_path && (
                            <button
                              className="secondary"
                              onClick={() => handlePreview(task.id)}
                              style={{ color: "#17a2b8" }}
                            >
                              预览
                            </button>
                          )}
                          <button
                            className="secondary"
                            onClick={async () => {
                              setLogsTaskId(task.id);
                              logsTaskIdRef.current = task.id;
                              setShowLogsModal(true);
                              try {
                                const response = await fetchTaskLogs(task.id);
                                if (logsTaskIdRef.current === task.id) {
                                  setCurrentLogs(response.logs || "No logs available");
                                }
                              } catch (err) {
                                if (logsTaskIdRef.current === task.id) {
                                  setCurrentLogs(
                                    err instanceof Error ? err.message : "Failed to fetch logs"
                                  );
                                }
                              }
                            }}
                            style={{ color: "#007bff" }}
                          >
                            日志
                          </button>
                          {/* Only show delete button if task belongs to current user */}
                          {(!task.user_id || task.user_id === profile?.user_id) && (
                            <button
                              className="secondary"
                              onClick={async () => {
                                if (
                                  confirm(`确定要删除任务 ${task.display_id || task.id} 吗？`)
                                ) {
                                  try {
                                    await deleteTask(task.id);
                                    await loadOthersTasks();
                                  } catch (err) {
                                    alert(
                                      err instanceof Error
                                        ? err.message
                                        : "删除失败"
                                    );
                                  }
                                }
                              }}
                              style={{ color: "#dc3545" }}
                            >
                              删除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页控件 */}
            {othersTotalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "1rem",
                  marginTop: "1.5rem",
                  paddingTop: "1rem",
                  borderTop: "1px solid #e0e0e0"
                }}
              >
                <button
                  className="secondary"
                  onClick={() => setOthersCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={othersCurrentPage === 1}
                  style={{
                    opacity: othersCurrentPage === 1 ? 0.5 : 1,
                    cursor: othersCurrentPage === 1 ? "not-allowed" : "pointer"
                  }}
                >
                  上一页
                </button>
                <span style={{ color: "#666" }}>
                  第 {othersCurrentPage} / {othersTotalPages} 页（共 {othersTotalTasks} 条）
                </span>
                <button
                  className="secondary"
                  onClick={() =>
                    setOthersCurrentPage((p) => Math.min(othersTotalPages, p + 1))
                  }
                  disabled={othersCurrentPage === othersTotalPages}
                  style={{
                    opacity: othersCurrentPage === othersTotalPages ? 0.5 : 1,
                    cursor: othersCurrentPage === othersTotalPages ? "not-allowed" : "pointer"
                  }}
                >
                  下一页
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === "system" && profile?.role === "admin" && (
        <>
          <section className="panel">
            <h2>系统管理</h2>

            <h3>Appauto 版本管理</h3>
            <p style={{ color: "#666", marginBottom: "1rem" }}>
              当前 Appauto 路径: {appautoPath || "加载中..."}
            </p>

            <div style={{ marginBottom: "2rem" }}>
              <h4>已安装版本</h4>
              {appautoVersions.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e0e0e0" }}>
                      <th style={{ padding: "0.5rem", textAlign: "left" }}>分支</th>
                      <th style={{ padding: "0.5rem", textAlign: "left" }}>版本</th>
                      <th style={{ padding: "0.5rem", textAlign: "left" }}>虚拟环境路径</th>
                      <th style={{ padding: "0.5rem", textAlign: "left" }}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appautoVersions.map((v: any) => (
                      <tr key={v.branch} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "0.5rem" }}>{v.branch}</td>
                        <td style={{ padding: "0.5rem" }}>{v.version || "未知"}</td>
                        <td style={{ padding: "0.5rem", fontSize: "0.875rem", color: "#666" }}>
                          {v.venv_path}
                        </td>
                        <td style={{ padding: "0.5rem" }}>
                          {v.exists ? (
                            <span style={{ color: "#28a745" }}>✓ 已安装</span>
                          ) : (
                            <span style={{ color: "#999" }}>未安装</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: "#999" }}>暂无已安装版本</p>
              )}
            </div>

            <div style={{ marginBottom: "2rem" }}>
              <h4>更新 Appauto</h4>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                <input
                  type="text"
                  value={updateBranch}
                  onChange={(e) => setUpdateBranch(e.target.value)}
                  placeholder="分支名 (如: main, v3.3.1)"
                  style={{ flex: 1, padding: "0.5rem" }}
                />
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      const response = await updateAppauto(updateBranch);
                      alert(`更新任务已创建: 任务 ${response.display_id}`);
                      await loadSystemTasks();
                    } catch (err) {
                      alert(
                        err instanceof Error
                          ? err.message
                          : "更新失败"
                      );
                    }
                  }}
                  disabled={!updateBranch}
                >
                  更新
                </button>
              </div>
            </div>
          </section>

          {/* 用户管理 */}
          <section className="panel">
            <h2>用户管理</h2>

            <div style={{ marginBottom: "1rem", display: "flex", gap: "1rem", alignItems: "center" }}>
              <button
                className="secondary"
                onClick={loadUsers}
                disabled={loadingUsers}
              >
                {loadingUsers ? "加载中..." : "刷新用户列表"}
              </button>
              <button
                className="danger"
                onClick={handleBatchDeleteUsers}
                disabled={loadingUsers || selectedUserIds.size === 0}
                style={{
                  backgroundColor: "#dc3545",
                  color: "white",
                  opacity: loadingUsers || selectedUserIds.size === 0 ? 0.5 : 1
                }}
              >
                批量删除 {selectedUserIds.size > 0 ? `(${selectedUserIds.size})` : ""}
              </button>
            </div>

            {loadingUsers ? (
              <p style={{ color: "#999" }}>加载中...</p>
            ) : users.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e0e0e0" }}>
                    <th style={{ padding: "0.5rem", textAlign: "left", width: "50px" }}>
                      <input
                        type="checkbox"
                        checked={selectedUserIds.size > 0 && selectedUserIds.size === users.filter(u => u.id !== profile?.user_id).length}
                        onChange={toggleSelectAll}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                    <th style={{ padding: "0.5rem", textAlign: "left" }}>ID</th>
                    <th style={{ padding: "0.5rem", textAlign: "left" }}>邮箱</th>
                    <th style={{ padding: "0.5rem", textAlign: "left" }}>角色</th>
                    <th style={{ padding: "0.5rem", textAlign: "left" }}>创建时间</th>
                    <th style={{ padding: "0.5rem", textAlign: "left" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      style={{
                        borderBottom: "1px solid #f0f0f0",
                        backgroundColor: user.id === profile?.user_id ? "#fff3cd" : "transparent",
                        borderLeft: user.id === profile?.user_id ? "3px solid #ffc107" : "3px solid transparent"
                      }}
                    >
                      <td style={{ padding: "0.5rem" }}>
                        {user.id === profile?.user_id ? (
                          <span style={{ color: "#999" }}>-</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={selectedUserIds.has(user.id)}
                            onChange={() => toggleUserSelection(user.id)}
                            style={{ cursor: "pointer" }}
                          />
                        )}
                      </td>
                      <td style={{
                        padding: "0.5rem",
                        fontWeight: user.id === profile?.user_id ? "bold" : "normal",
                        color: user.id === profile?.user_id ? "#000" : "inherit"
                      }}>
                        {user.id}
                      </td>
                      <td style={{
                        padding: "0.5rem",
                        fontWeight: user.id === profile?.user_id ? "bold" : "normal",
                        color: user.id === profile?.user_id ? "#000" : "inherit"
                      }}>
                        {user.email}
                        {user.id === profile?.user_id && (
                          <span style={{ marginLeft: "0.5rem", color: "#856404", fontSize: "0.875rem", fontWeight: "normal" }}>
                            (当前用户)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <span
                          style={{
                            padding: "0.25rem 0.5rem",
                            borderRadius: "4px",
                            fontSize: "0.875rem",
                            backgroundColor: user.role === "admin" ? "#e3f2fd" : "#f5f5f5",
                            color: user.role === "admin" ? "#1976d2" : "#666"
                          }}
                        >
                          {user.role === "admin" ? "管理员" : "普通用户"}
                        </span>
                      </td>
                      <td style={{ padding: "0.5rem", fontSize: "0.875rem", color: "#666" }}>
                        {new Date(user.created_at).toLocaleString("zh-CN")}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        {user.id === profile?.user_id ? (
                          <span style={{ color: "#999", fontSize: "0.875rem" }}>
                            不能修改自己
                          </span>
                        ) : (
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <select
                              value={user.role}
                              onChange={(e) => {
                                const newRole = e.target.value;
                                if (window.confirm(`确定要将 ${user.email} 的角色修改为 ${newRole === "admin" ? "管理员" : "普通用户"} 吗？`)) {
                                  handleUpdateUserRole(user.id, newRole);
                                }
                              }}
                              style={{
                                padding: "0.25rem 0.5rem",
                                borderRadius: "4px",
                                border: "1px solid #ddd",
                                fontSize: "0.875rem"
                              }}
                            >
                              <option value="user">普通用户</option>
                              <option value="admin">管理员</option>
                            </select>
                            <button
                              onClick={() => {
                                const newPassword = prompt(`请输入 ${user.email} 的新密码（至少8位）：`);
                                if (newPassword && newPassword.length >= 8) {
                                  handleResetPassword(user.id, user.email, newPassword);
                                } else if (newPassword) {
                                  alert("密码长度至少为8位");
                                }
                              }}
                              style={{
                                padding: "0.25rem 0.5rem",
                                fontSize: "0.875rem",
                                backgroundColor: "#ff9800",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer"
                              }}
                            >
                              重置密码
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id, user.email)}
                              style={{
                                padding: "0.25rem 0.5rem",
                                fontSize: "0.875rem",
                                backgroundColor: "#dc3545",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer"
                              }}
                            >
                              删除
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: "#999" }}>暂无用户数据</p>
            )}
          </section>

          {/* 系统维护任务列表 */}
          <section className="panel">
            <h2>系统维护任务列表</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>状态</th>
                    <th>操作</th>
                    <th>分支</th>
                    <th>创建者</th>
                    <th>创建时间</th>
                    <th>完成时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {systemTasks.map((task) => (
                    <tr key={task.id}>
                      <td>{task.display_id || task.id}</td>
                      <td>
                        <span
                          className={`status-badge status-${task.status.toLowerCase()}`}
                        >
                          {task.status}
                        </span>
                      </td>
                      <td>{task.parameters?.operation || "-"}</td>
                      <td>{task.parameters?.branch || "-"}</td>
                      <td>
                        {task.user_email ? (
                          <span style={{
                            color: task.user_id === profile?.user_id ? "#28a745" : "#666",
                            fontWeight: task.user_id === profile?.user_id ? "600" : "normal"
                          }}>
                            {task.user_email}
                          </span>
                        ) : (
                          <span style={{ color: "#999" }}>未知</span>
                        )}
                      </td>
                      <td>{new Date(task.created_at).toLocaleString()}</td>
                      <td>
                        {task.completed_at
                          ? new Date(task.completed_at).toLocaleString()
                          : "-"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            className="secondary"
                            onClick={async () => {
                              setLogsTaskId(task.id);
                              logsTaskIdRef.current = task.id;
                              setShowLogsModal(true);
                              try {
                                const response = await fetchTaskLogs(task.id);
                                if (logsTaskIdRef.current === task.id) {
                                  setCurrentLogs(response.logs || "No logs available");
                                }
                              } catch (err) {
                                if (logsTaskIdRef.current === task.id) {
                                  setCurrentLogs(
                                    err instanceof Error ? err.message : "Failed to fetch logs"
                                  );
                                }
                              }
                            }}
                            style={{ color: "#007bff" }}
                          >
                            日志
                          </button>
                          {(!task.user_id || task.user_id === profile?.user_id) && (
                            <button
                              className="secondary"
                              onClick={async () => {
                                if (
                                  confirm(`确定要删除任务 ${task.display_id || task.id} 吗？`)
                                ) {
                                  try {
                                    await deleteTask(task.id);
                                    await loadSystemTasks();
                                  } catch (err) {
                                    alert(
                                      err instanceof Error
                                        ? err.message
                                        : "删除失败"
                                    );
                                  }
                                }
                              }}
                              style={{ color: "#dc3545" }}
                            >
                              删除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页控件 */}
            {systemTotalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "1rem",
                  marginTop: "1.5rem",
                  paddingTop: "1rem",
                  borderTop: "1px solid #e0e0e0"
                }}
              >
                <button
                  className="secondary"
                  onClick={() => setSystemCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={systemCurrentPage === 1}
                  style={{
                    opacity: systemCurrentPage === 1 ? 0.5 : 1,
                    cursor: systemCurrentPage === 1 ? "not-allowed" : "pointer"
                  }}
                >
                  上一页
                </button>
                <span style={{ color: "#666" }}>
                  第 {systemCurrentPage} / {systemTotalPages} 页（共 {systemTotalTasks} 条）
                </span>
                <button
                  className="secondary"
                  onClick={() =>
                    setSystemCurrentPage((p) => Math.min(systemTotalPages, p + 1))
                  }
                  disabled={systemCurrentPage === systemTotalPages}
                  style={{
                    opacity: systemCurrentPage === systemTotalPages ? 0.5 : 1,
                    cursor: systemCurrentPage === systemTotalPages ? "not-allowed" : "pointer"
                  }}
                >
                  下一页
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {/* 预览结果模态框 */}
      {showPreviewModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            style={{
              backgroundColor: theme === "dark" ? "#2a2a2a" : "white",
              padding: "2rem",
              borderRadius: "8px",
              maxWidth: "95%",
              maxHeight: "90%",
              overflow: "auto",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              minWidth: "800px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.5rem",
              }}
            >
              <h2 style={{ margin: 0, color: theme === "dark" ? "#f0f0f0" : "#1a1a1a", fontSize: "1.5rem" }}>
                性能测试结果预览
              </h2>
              <button
                onClick={() => setShowPreviewModal(false)}
                style={{
                  padding: "0.5rem 1rem",
                  cursor: "pointer",
                  border: "1px solid #d0d0d0",
                  borderRadius: "4px",
                  backgroundColor: "#f8f9fa",
                  color: "#333",
                  fontWeight: "500",
                }}
              >
                关闭
              </button>
            </div>

            {previewLoading ? (
              <div style={{ textAlign: "center", padding: "3rem", color: theme === "dark" ? "#ccc" : "#666" }}>
                <p>加载中...</p>
              </div>
            ) : previewData && previewData.error ? (
              <div style={{
                textAlign: "center",
                padding: "3rem",
                backgroundColor: theme === "dark" ? "#2a1a1a" : "#fff5f5",
                borderRadius: "8px",
                border: `1px solid ${theme === "dark" ? "#5a2a2a" : "#ffcccc"}`,
              }}>
                <div style={{
                  fontSize: "3rem",
                  marginBottom: "1rem",
                  color: theme === "dark" ? "#ff6b6b" : "#dc3545",
                }}>
                  ⚠️
                </div>
                <h3 style={{
                  color: theme === "dark" ? "#ff6b6b" : "#dc3545",
                  marginBottom: "1rem",
                  fontSize: "1.25rem",
                }}>
                  无法加载预览数据
                </h3>
                <p style={{
                  color: theme === "dark" ? "#ccc" : "#666",
                  marginBottom: "1.5rem",
                  lineHeight: "1.6",
                }}>
                  {previewData.error}
                </p>
                <div style={{
                  padding: "1rem",
                  backgroundColor: theme === "dark" ? "#1a1a1a" : "#f8f9fa",
                  borderRadius: "4px",
                  fontSize: "0.875rem",
                  color: theme === "dark" ? "#999" : "#666",
                  textAlign: "left",
                  maxWidth: "600px",
                  margin: "0 auto",
                }}>
                  <p style={{ marginBottom: "0.5rem", fontWeight: "600" }}>可能的原因：</p>
                  <ul style={{ margin: 0, paddingLeft: "1.5rem" }}>
                    <li>结果文件不存在或已被删除</li>
                    <li>任务尚未完成或执行失败</li>
                    <li>文件格式不正确</li>
                  </ul>
                </div>
              </div>
            ) : previewData && previewData.sheets && previewData.sheets.length > 0 ? (
              <div>
                {/* 工作表标签（如果有多个工作表） */}
                {previewData.sheets.length > 1 && (
                  <div style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginBottom: "1.5rem",
                    borderBottom: `1px solid ${theme === "dark" ? "#333" : "#e0e0e0"}`,
                  }}>
                    {previewData.sheets.map((sheet: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentSheetIndex(idx)}
                        style={{
                          padding: "0.75rem 1.5rem",
                          border: "none",
                          borderBottom: currentSheetIndex === idx ? `2px solid ${theme === "dark" ? "#4fc3f7" : "#007bff"}` : "2px solid transparent",
                          backgroundColor: "transparent",
                          color: currentSheetIndex === idx
                            ? (theme === "dark" ? "#4fc3f7" : "#007bff")
                            : (theme === "dark" ? "#999" : "#666"),
                          fontWeight: currentSheetIndex === idx ? "600" : "normal",
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                      >
                        {sheet.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* 当前工作表内容 */}
                {previewData.sheets[currentSheetIndex] && (
                  <div>
                    {/* 提示信息 */}
                    {previewData.sheets[currentSheetIndex].is_truncated && (
                      <div style={{
                        padding: "0.75rem 1rem",
                        marginBottom: "1rem",
                        backgroundColor: theme === "dark" ? "#2a2a00" : "#fff3cd",
                        border: `1px solid ${theme === "dark" ? "#4a4a00" : "#ffc107"}`,
                        borderRadius: "4px",
                        color: theme === "dark" ? "#ffeb3b" : "#856404",
                        fontSize: "0.875rem",
                      }}>
                        显示前 {previewData.sheets[currentSheetIndex].rows.length} 行，共 {previewData.sheets[currentSheetIndex].total_rows} 行
                      </div>
                    )}

                    {/* 表格 */}
                    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "60vh" }}>
                      <table style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.875rem",
                      }}>
                        <tbody>
                          {previewData.sheets[currentSheetIndex].rows.map((row: any[], rowIdx: number) => (
                            <tr
                              key={rowIdx}
                              style={{
                                backgroundColor: rowIdx === 0
                                  ? (theme === "dark" ? "#1a1a1a" : "#f8f9fa")
                                  : (rowIdx % 2 === 0 ? (theme === "dark" ? "#252525" : "white") : "transparent"),
                                borderBottom: `1px solid ${theme === "dark" ? "#333" : "#e0e0e0"}`,
                              }}
                            >
                              {row.map((cell: any, cellIdx: number) => {
                                const isHeader = rowIdx === 0;
                                const Tag = isHeader ? "th" : "td";
                                return (
                                  <Tag
                                    key={cellIdx}
                                    style={{
                                      padding: "0.75rem",
                                      textAlign: "left",
                                      color: isHeader
                                        ? (theme === "dark" ? "#f0f0f0" : "#333")
                                        : (theme === "dark" ? "#ccc" : "#666"),
                                      fontWeight: isHeader ? "600" : "normal",
                                      whiteSpace: "nowrap",
                                      borderRight: `1px solid ${theme === "dark" ? "#333" : "#e0e0e0"}`,
                                    }}
                                  >
                                    {typeof cell === "number"
                                      ? (Number.isInteger(cell) ? cell : cell.toFixed(4))
                                      : String(cell)}
                                  </Tag>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "3rem", color: theme === "dark" ? "#ccc" : "#666" }}>
                <p>无预览数据</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 日志查看模态框 */}
      {showLogsModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => {
            logsTaskIdRef.current = null;
            setShowLogsModal(false);
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "8px",
              maxWidth: "90%",
              maxHeight: "90%",
              overflow: "auto",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h2 style={{ margin: 0, color: "#1a1a1a", fontSize: "1.25rem" }}>任务 {logsTaskId} 的执行日志</h2>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <button
                  onClick={async () => {
                    if (logsTaskId) {
                      try {
                        const response = await fetchTaskLogs(logsTaskId);
                        // Only update if this is still the current task
                        if (logsTaskIdRef.current === logsTaskId) {
                          setCurrentLogs(response.logs);
                        }
                      } catch (err) {
                        console.error("Failed to refresh logs:", err);
                      }
                    }
                  }}
                  style={{
                    padding: "0.5rem 1rem",
                    cursor: "pointer",
                    border: "1px solid #d0d0d0",
                    borderRadius: "4px",
                    backgroundColor: "#f8f9fa",
                    color: "#333",
                    fontWeight: "500",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#e9ecef";
                    e.currentTarget.style.borderColor = "#adb5bd";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#f8f9fa";
                    e.currentTarget.style.borderColor = "#d0d0d0";
                  }}
                >
                  🔄 刷新
                </button>
                <button
                  onClick={() => {
                    logsTaskIdRef.current = null;
                    setShowLogsModal(false);
                  }}
                  style={{
                    padding: "0.5rem 1rem",
                    cursor: "pointer",
                    border: "1px solid #d0d0d0",
                    borderRadius: "4px",
                    backgroundColor: "#f8f9fa",
                    color: "#333",
                    fontWeight: "500",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#e9ecef";
                    e.currentTarget.style.borderColor = "#adb5bd";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#f8f9fa";
                    e.currentTarget.style.borderColor = "#d0d0d0";
                  }}
                >
                  关闭
                </button>
              </div>
            </div>
            <pre
              style={{
                backgroundColor: "#2d2d2d",
                color: "#f8f8f2",
                padding: "1rem",
                borderRadius: "4px",
                overflow: "auto",
                maxHeight: "70vh",
                fontSize: "0.875rem",
                lineHeight: "1.5",
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
                border: "1px solid #444",
              }}
            >
              {currentLogs}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
