import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { CollapsiblePanel, StatusBadge, TaskTable, Pagination, Modal } from "./components";
import { usePagination, useModal } from "./hooks";
import { OthersPage, BasicTestPage, DeploymentPage, SystemManagementPage, CorrectnessTestPage, PerformanceTestPage } from "./pages";
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
  runEvalTest,
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

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);
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
  timeout_minutes: 30,

  // 正确性测试配置 (EvalScope)
  dataset: "",
  max_tokens: 35000,
  eval_concurrency: 2,
  temperature: 0.6,
  enable_thinking: true,
  keep_model: true,
  timeout_hours: 4,
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
  const [activeTab, setActiveTab] = useState<"basic" | "performance" | "correctness" | "deployment" | "others" | "system">("performance");
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("theme");
    return (saved as "dark" | "light") || "dark";
  });
  const [expandedSection, setExpandedSection] = useState<string | null>("existing-model");

  // Modal states
  const logsModal = useModal();
  const [currentLogs, setCurrentLogs] = useState<string>("");
  const [logsTaskId, setLogsTaskId] = useState<number | null>(null);
  const logsTaskIdRef = useRef<number | null>(null);

  const previewModal = useModal();
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);

  // Password visibility state
  const [showPassword, setShowPassword] = useState({
    auth: false,
    ssh: false,
    sudo: false,
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
  const othersPagination = usePagination();

  // System management state
  const [systemTasks, setSystemTasks] = useState<TaskSummary[]>([]);
  const systemPagination = usePagination();
  const [appautoVersions, setAppautoVersions] = useState<any[]>([]);
  const [appautoPath, setAppautoPath] = useState<string>("");
  const [updateBranch, setUpdateBranch] = useState<string>("main");

  // Deployment state
  const [deployTasks, setDeployTasks] = useState<TaskSummary[]>([]);
  const deployPagination = usePagination();

  // User management state
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());

  // Pagination state
  const perfPagination = usePagination();
  const [pageSize] = useState(20);

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
  }, [profile, perfPagination.currentPage]);

  useEffect(() => {
    if (!profile) return;
    loadOthersTasks();
    const timer = setInterval(loadOthersTasks, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, othersPagination.currentPage]);

  useEffect(() => {
    if (!profile) return;
    loadSystemTasks();
    loadAppautoVersions();
    loadUsers();
    const timer = setInterval(loadSystemTasks, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, systemPagination.currentPage]);

  useEffect(() => {
    if (!profile) return;
    loadDeployTasks();
    const timer = setInterval(loadDeployTasks, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, deployPagination.currentPage]);

  // Toggle collapsible panel
  const togglePanel = (panelId: string) => {
    setExpandedSection(expandedSection === panelId ? null : panelId);
  };

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
        page: perfPagination.currentPage,
        page_size: pageSize,
        // 移除 task_type 过滤，加载所有任务（包括 pytest 和 perf_test）
      });
      setTasks(data.items);
      perfPagination.setTotalTasks(data.total);
      perfPagination.setTotalPages(data.total_pages);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadOthersTasks() {
    if (!profile) return;
    try {
      const data = await fetchTasks({
        page: othersPagination.currentPage,
        page_size: pageSize,
        task_type: "hardware_info"
      });
      setOthersTasks(data.items);
      othersPagination.setTotalTasks(data.total);
      othersPagination.setTotalPages(data.total_pages);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadSystemTasks() {
    if (!profile) return;
    try {
      const data = await fetchTasks({
        page: systemPagination.currentPage,
        page_size: pageSize,
        task_type: "system_maintenance"
      });
      setSystemTasks(data.items);
      systemPagination.setTotalTasks(data.total);
      systemPagination.setTotalPages(data.total_pages);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadDeployTasks() {
    if (!profile) return;
    try {
      const data = await fetchTasks({
        page: deployPagination.currentPage,
        page_size: pageSize,
        task_type: "env_deploy"
      });
      setDeployTasks(data.items);
      deployPagination.setTotalTasks(data.total);
      deployPagination.setTotalPages(data.total_pages);
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

      // 自动选择第一个版本，如果当前选择的版本不在列表中
      if (data.versions.length > 0) {
        const branchExists = data.versions.some((v: any) => v.branch === updateBranch);
        if (!branchExists) {
          setUpdateBranch(data.versions[0].branch);
        }
      }
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
    logsModal.open();

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
    previewModal.open();
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
          className={activeTab === "deployment" ? "tab active" : "tab"}
          onClick={() => setActiveTab("deployment")}
        >
          环境部署
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
        <BasicTestPage
          expandedSection={expandedSection}
          togglePanel={togglePanel}
          form={form}
          updateForm={updateForm}
          validationErrors={validationErrors}
          setValidationErrors={setValidationErrors}
          appautoBranches={appautoBranches}
          loadingBranches={loadingBranches}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          loading={loading}
          setLoading={setLoading}
          error={error || ""}
          setError={setError}
          message={message || ""}
          setMessage={setMessage}
          tasks={tasks}
          loadTasks={loadTasks}
          profile={profile}
          handlePreview={handlePreview}
          handleArchive={handleArchive}
          handleViewLogs={handleViewLogs}
          handleRetry={handleRetry}
          handleCancel={handleCancel}
          handleDelete={handleDelete}
        />
      )}

      {activeTab === "performance" && (
        <PerformanceTestPage
          expandedSection={expandedSection}
          togglePanel={togglePanel}
          form={form}
          updateForm={updateForm}
          validationErrors={validationErrors}
          setValidationErrors={setValidationErrors}
          validatePerfTestForm={validatePerfTestForm}
          validateLaunchTestForm={validateLaunchTestForm}
          loading={loading}
          setLoading={setLoading}
          message={message}
          setMessage={setMessage}
          error={error}
          setError={setError}
          loadTasks={loadTasks}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          scannedModels={scannedModels}
          setScannedModels={setScannedModels}
          scanningModels={scanningModels}
          setScanningModels={setScanningModels}
          handleScanModels={handleScanModels}
          appautoBranches={appautoBranches}
          loadingBranches={loadingBranches}
          tasks={tasks}
          profile={profile}
          handlePreview={handlePreview}
          handleArchive={handleArchive}
          handleViewLogs={handleViewLogs}
          handleRetry={handleRetry}
          handleCancel={handleCancel}
          handleDelete={handleDelete}
          perfPagination={perfPagination}
        />
      )}

      {activeTab === "correctness" && (
        <CorrectnessTestPage
          expandedSection={expandedSection}
          togglePanel={togglePanel}
          form={form}
          updateForm={updateForm}
          validationErrors={validationErrors}
          setValidationErrors={setValidationErrors}
          appautoBranches={appautoBranches}
          loadingBranches={loadingBranches}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          loading={loading}
          setLoading={setLoading}
          error={error}
          setError={setError}
          success={success}
          setSuccess={setSuccess}
          tasks={tasks}
          loadTasks={loadTasks}
          profile={profile}
          handleViewLogs={handleViewLogs}
          handleRetry={handleRetry}
          handleCancel={handleCancel}
          handleDelete={handleDelete}
          scannedModels={scannedModels}
          scanningModels={scanningModels}
          handleScanModels={handleScanModels}
        />
      )}

      {activeTab === "deployment" && (
        <DeploymentPage
          expandedSection={expandedSection}
          togglePanel={togglePanel}
          form={form}
          updateForm={updateForm}
          validationErrors={validationErrors}
          setValidationErrors={setValidationErrors}
          appautoBranches={appautoBranches}
          loadingBranches={loadingBranches}
          loading={loading}
          setLoading={setLoading}
          message={message || ""}
          setMessage={setMessage}
          success={success || ""}
          setSuccess={setSuccess}
          deployTasks={deployTasks}
          loadDeployTasks={loadDeployTasks}
          profile={profile}
          handleViewLogs={handleViewLogs}
          cancelTask={async (taskId) => { await cancelTask(taskId); }}
          retryTask={async (taskId) => { await retryTask(taskId); }}
          deleteTask={deleteTask}
        />
      )}

      {activeTab === "others" && (
        <OthersPage
          expandedSection={expandedSection}
          togglePanel={togglePanel}
          sshHost={sshHost}
          setSshHost={setSshHost}
          sshUser={sshUser}
          setSshUser={setSshUser}
          sshPassword={sshPassword}
          setSshPassword={setSshPassword}
          sshPort={sshPort}
          setSshPort={setSshPort}
          showSshPassword={showSshPassword}
          setShowSshPassword={setShowSshPassword}
          error={error}
          setError={setError}
          success={success}
          setSuccess={setSuccess}
          othersTasks={othersTasks}
          loadOthersTasks={loadOthersTasks}
          profile={profile}
          othersPagination={othersPagination}
          handlePreview={handlePreview}
          setLogsTaskId={setLogsTaskId}
          logsTaskIdRef={logsTaskIdRef}
          logsModal={logsModal}
          setCurrentLogs={setCurrentLogs}
        />
      )}

      {activeTab === "system" && profile?.role === "admin" && (
        <SystemManagementPage
          expandedSection={expandedSection}
          togglePanel={togglePanel}
          appautoVersions={appautoVersions}
          appautoPath={appautoPath}
          updateBranch={updateBranch}
          setUpdateBranch={setUpdateBranch}
          users={users}
          loadingUsers={loadingUsers}
          selectedUserIds={selectedUserIds}
          profile={profile}
          loadSystemTasks={loadSystemTasks}
          loadUsers={loadUsers}
          toggleUserSelection={toggleUserSelection}
          toggleSelectAll={toggleSelectAll}
          handleUpdateUserRole={handleUpdateUserRole}
          handleResetPassword={handleResetPassword}
          handleDeleteUser={handleDeleteUser}
          handleBatchDeleteUsers={handleBatchDeleteUsers}
          systemTasks={systemTasks}
          systemPagination={systemPagination}
          setLogsTaskId={setLogsTaskId}
          logsTaskIdRef={logsTaskIdRef}
          logsModal={logsModal}
          setCurrentLogs={setCurrentLogs}
        />
      )}

      {/* 预览结果模态框 */}
      <Modal
        isOpen={previewModal.isOpen}
        onClose={() => previewModal.close()}
        title={previewData && previewData.file_type === "json" ? "硬件信息预览" : "性能测试结果预览"}
        theme={theme}
        minWidth="800px"
      >
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
            ) : previewData && previewData.file_type === "json" ? (
              <div>
                <div style={{
                  backgroundColor: theme === "dark" ? "#1a1a1a" : "#f8f9fa",
                  padding: "1.5rem",
                  borderRadius: "8px",
                  maxHeight: "600px",
                  overflow: "auto",
                }}>
                  <pre style={{
                    margin: 0,
                    color: theme === "dark" ? "#f0f0f0" : "#1a1a1a",
                    fontSize: "0.875rem",
                    lineHeight: "1.6",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}>
                    {JSON.stringify(previewData.json_data, null, 2)}
                  </pre>
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

                    {/* 性能图表 */}
                    {previewData.chart_data && (
                      <div style={{ marginTop: "2rem" }}>
                        <h3 style={{
                          color: theme === "dark" ? "#f0f0f0" : "#1a1a1a",
                          marginBottom: "1.5rem",
                          fontSize: "1.25rem",
                        }}>
                          性能图表
                        </h3>

                        {!previewData.chart_data.has_multiple_concurrency ? (
                          <div style={{
                            padding: "1.5rem",
                            backgroundColor: theme === "dark" ? "#2a2a00" : "#fff3cd",
                            border: `1px solid ${theme === "dark" ? "#4a4a00" : "#ffc107"}`,
                            borderRadius: "4px",
                            color: theme === "dark" ? "#ffeb3b" : "#856404",
                            fontSize: "0.875rem",
                          }}>
                            此任务仅包含单一并发度（Concurrency = {previewData.chart_data.concurrency_levels[0]}），无法生成并发度对比图表。
                          </div>
                        ) : (
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "1.5rem"
                          }}>
                            {/* Concurrency vs TTFT 图表 */}
                            <div>
                              <h4 style={{
                                color: theme === "dark" ? "#ccc" : "#666",
                                marginBottom: "1rem",
                                fontSize: "1rem",
                              }}>
                                并发度 vs TTFT (Time to first token)
                              </h4>
                              <div style={{
                                backgroundColor: theme === "dark" ? "#1a1a1a" : "white",
                                padding: "1.5rem",
                                borderRadius: "8px",
                                border: `1px solid ${theme === "dark" ? "#333" : "#e0e0e0"}`,
                              }}>
                                <Line
                                  data={{
                                    labels: previewData.chart_data.concurrency_levels.map(String),
                                    datasets: [
                                      {
                                        label: "平均 TTFT (秒)",
                                        data: previewData.chart_data.ttft_values,
                                        borderColor: theme === "dark" ? "#4fc3f7" : "#007bff",
                                        backgroundColor: theme === "dark" ? "rgba(79, 195, 247, 0.2)" : "rgba(0, 123, 255, 0.2)",
                                        tension: 0.1,
                                      },
                                    ],
                                  }}
                                  options={{
                                    responsive: true,
                                    maintainAspectRatio: true,
                                    plugins: {
                                      legend: {
                                        labels: {
                                          color: theme === "dark" ? "#ccc" : "#666",
                                        },
                                      },
                                      title: {
                                        display: false,
                                      },
                                    },
                                    scales: {
                                      x: {
                                        title: {
                                          display: true,
                                          text: "并发度 (Concurrency)",
                                          color: theme === "dark" ? "#ccc" : "#666",
                                        },
                                        ticks: {
                                          color: theme === "dark" ? "#999" : "#666",
                                        },
                                        grid: {
                                          color: theme === "dark" ? "#333" : "#e0e0e0",
                                        },
                                      },
                                      y: {
                                        title: {
                                          display: true,
                                          text: "平均 TTFT (秒)",
                                          color: theme === "dark" ? "#ccc" : "#666",
                                        },
                                        ticks: {
                                          color: theme === "dark" ? "#999" : "#666",
                                        },
                                        grid: {
                                          color: theme === "dark" ? "#333" : "#e0e0e0",
                                        },
                                      },
                                    },
                                  }}
                                />
                              </div>
                            </div>

                            {/* Concurrency vs TPS 图表 */}
                            <div>
                              <h4 style={{
                                color: theme === "dark" ? "#ccc" : "#666",
                                marginBottom: "1rem",
                                fontSize: "1rem",
                              }}>
                                并发度 vs TPS (Token per second)
                              </h4>
                              <div style={{
                                backgroundColor: theme === "dark" ? "#1a1a1a" : "white",
                                padding: "1.5rem",
                                borderRadius: "8px",
                                border: `1px solid ${theme === "dark" ? "#333" : "#e0e0e0"}`,
                              }}>
                                <Line
                                  data={{
                                    labels: previewData.chart_data.concurrency_levels.map(String),
                                    datasets: [
                                      {
                                        label: "平均 TPS (tokens/s)",
                                        data: previewData.chart_data.tps_values,
                                        borderColor: theme === "dark" ? "#66bb6a" : "#28a745",
                                        backgroundColor: theme === "dark" ? "rgba(102, 187, 106, 0.2)" : "rgba(40, 167, 69, 0.2)",
                                        tension: 0.1,
                                      },
                                    ],
                                  }}
                                  options={{
                                    responsive: true,
                                    maintainAspectRatio: true,
                                    plugins: {
                                      legend: {
                                        labels: {
                                          color: theme === "dark" ? "#ccc" : "#666",
                                        },
                                      },
                                      title: {
                                        display: false,
                                      },
                                    },
                                    scales: {
                                      x: {
                                        title: {
                                          display: true,
                                          text: "并发度 (Concurrency)",
                                          color: theme === "dark" ? "#ccc" : "#666",
                                        },
                                        ticks: {
                                          color: theme === "dark" ? "#999" : "#666",
                                        },
                                        grid: {
                                          color: theme === "dark" ? "#333" : "#e0e0e0",
                                        },
                                      },
                                      y: {
                                        title: {
                                          display: true,
                                          text: "平均 TPS (tokens/s)",
                                          color: theme === "dark" ? "#ccc" : "#666",
                                        },
                                        ticks: {
                                          color: theme === "dark" ? "#999" : "#666",
                                        },
                                        grid: {
                                          color: theme === "dark" ? "#333" : "#e0e0e0",
                                        },
                                      },
                                    },
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
          <div style={{ textAlign: "center", padding: "3rem", color: theme === "dark" ? "#ccc" : "#666" }}>
            <p>无预览数据</p>
          </div>
        )}
      </Modal>

      {/* 日志查看模态框 */}
      <Modal
        isOpen={logsModal.isOpen}
        onClose={() => {
          logsTaskIdRef.current = null;
          logsModal.close();
        }}
        title={`任务 ${logsTaskId} 的执行日志`}
        maxWidth="90%"
        headerActions={
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
        }
      >
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
      </Modal>
    </div>
  );
}

export default App;
