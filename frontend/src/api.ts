import {
  AuthResponse,
  HealthCheckResponse,
  ModelInfo,
  ModelInstanceListResponse,
  ModelInstanceResponse,
  Profile,
  ScanModelsResponse,
  SSHConfig,
  TaskListResponse,
  TestRunForm,
  TestRunResponse,
} from "./types";

export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") ||
  "/api";

const TOKEN_KEY = "llm-perf-token";
let cachedToken: string | null = localStorage.getItem(TOKEN_KEY);

export function setAuthToken(token: string | null) {
  cachedToken = token;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getAuthToken() {
  return cachedToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {}),
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Request failed");
  }
  return response.json();
}

export function runTest(payload: TestRunForm): Promise<TestRunResponse> {
  return request("/tests/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// 新增：专用性能测试 API
export function runPerfTest(payload: {
  base: "amaas" | "ft";
  skip_launch: boolean;
  ip: string;
  port?: number;
  model: string;
  tokenizer_path?: string;
  ssh_user: string;
  ssh_password?: string;
  ssh_port?: number;
  parallel: string;
  number: string;
  input_length: number;
  output_length: number;
  loop?: number;
  debug?: boolean;
  warmup?: boolean;
  keep_model?: boolean;
  tp?: number;
  launch_timeout?: number;
}): Promise<TestRunResponse> {
  const { base, skip_launch } = payload;
  const endpoint = `/tests/run_perf/${base}/${skip_launch ? "skip_launch" : "with_launch"}`;

  return request(endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchTasks(params?: { page?: number; page_size?: number; task_type?: string }): Promise<TaskListResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.page_size) queryParams.append("page_size", params.page_size.toString());
  if (params?.task_type) queryParams.append("task_type", params.task_type);

  const queryString = queryParams.toString();
  return request(`/tests/list${queryString ? `?${queryString}` : ""}`);
}

export function archiveTask(taskId: number): Promise<void> {
  return request("/tests/archive", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId }),
  });
}

export function deleteTask(taskId: number): Promise<void> {
  return request(`/tests/${taskId}`, {
    method: "DELETE",
  });
}

export function cancelTask(taskId: number): Promise<{
  task_id: number;
  cancelled: boolean;
  message: string;
}> {
  return request(`/tests/${taskId}/cancel`, {
    method: "POST",
  });
}

export function downloadUrl(taskId: number): string {
  return `${API_BASE}/tests/${taskId}/result`;
}

export function fetchTaskLogs(taskId: number): Promise<{
  task_id: number;
  logs: string;
  log_file_path: string | null;
}> {
  return request(`/tests/${taskId}/logs`);
}

export function retryTask(taskId: number): Promise<{
  task_id: number;
  new_task_id: number;
  status: string;
  message: string;
}> {
  return request(`/tests/${taskId}/retry`, {
    method: "POST",
  });
}

export interface ChartData {
  concurrency_levels: number[];
  ttft_values: number[];
  tps_values: number[];
  has_multiple_concurrency: boolean;
}

export interface PreviewSheet {
  name: string;
  rows: Array<any[]>;
  total_rows: number;
  is_truncated: boolean;
}

export interface PreviewResultResponse {
  task_id: number;
  sheets: PreviewSheet[];
  chart_data?: ChartData | null;
}

export function previewResult(taskId: number): Promise<PreviewResultResponse> {
  return request(`/tests/${taskId}/preview`);
}

export function registerUser(payload: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function loginUser(payload: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchProfile(): Promise<Profile> {
  return request("/auth/me");
}

// 模型管理 API

export function scanModels(payload: {
  ssh_config: SSHConfig;
  base_dir?: string;
  include_hidden?: boolean;
}): Promise<ScanModelsResponse> {
  return request("/models/scan", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function launchModel(payload: {
  model_name: string;
  engine: string;
  tp: number;
  mode?: string;
  model_path?: string | null;
  host?: string;
  port: number;
  ssh_config?: SSHConfig | null;
  base_model_dir?: string;
  python_path?: string;
}): Promise<{ instance: ModelInstanceResponse; message: string }> {
  return request("/models/launch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchModelInstances(params?: {
  status?: string;
  model_name?: string;
  engine?: string;
}): Promise<ModelInstanceListResponse> {
  const queryParams = new URLSearchParams();
  if (params?.status) queryParams.append("status", params.status);
  if (params?.model_name) queryParams.append("model_name", params.model_name);
  if (params?.engine) queryParams.append("engine", params.engine);

  const queryString = queryParams.toString();
  return request(`/models/instances${queryString ? `?${queryString}` : ""}`);
}

export function getModelInstance(
  instanceId: number,
): Promise<ModelInstanceResponse> {
  return request(`/models/instances/${instanceId}`);
}

export function stopModelInstance(instanceId: number): Promise<{
  instance_id: number;
  success: boolean;
  message: string;
}> {
  return request(`/models/instances/${instanceId}/stop`, {
    method: "POST",
  });
}

export function checkModelHealth(
  instanceId: number,
): Promise<HealthCheckResponse> {
  return request(`/models/instances/${instanceId}/health`, {
    method: "POST",
  });
}

// Appauto 分支管理 API

export function fetchAppautoBranches(): Promise<{
  branches: string[];
  source_path: string;
}> {
  return request("/tests/appauto/branches");
}

// 硬件信息收集 API

export function collectHardwareInfo(payload: {
  ssh_config: SSHConfig;
  timeout?: number;
}): Promise<{
  task_id: number;
  status: string;
  message: string;
}> {
  return request("/tests/hardware_info/collect", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// 系统管理 API

export interface AppautoVersionInfo {
  branch: string;
  venv_path: string;
  version: string | null;
  exists: boolean;
}

export interface AppautoVersionsResponse {
  versions: AppautoVersionInfo[];
  appauto_path: string;
}

export function getAppautoVersions(): Promise<AppautoVersionsResponse> {
  return request("/system/appauto/versions");
}

export function updateAppauto(branch: string): Promise<{
  task_id: number;
  display_id: number;
  uuid: string;
  status: string;
  message: string;
}> {
  return request("/system/appauto/update", {
    method: "POST",
    body: JSON.stringify({ branch }),
  });
}

// 用户管理 API

export interface UserInfo {
  id: number;
  email: string;
  role: string;
  created_at: string;
}

export interface UserListResponse {
  users: UserInfo[];
  total: number;
}

export function listUsers(): Promise<UserListResponse> {
  return request("/system/users");
}

export function updateUserRole(userId: number, role: string): Promise<{
  user_id: number;
  email: string;
  role: string;
  message: string;
}> {
  return request(`/system/users/${userId}/role`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

export function resetUserPassword(userId: number, newPassword: string): Promise<{
  user_id: number;
  email: string;
  message: string;
}> {
  return request(`/system/users/${userId}/password`, {
    method: "PUT",
    body: JSON.stringify({ new_password: newPassword }),
  });
}

export function deleteUser(userId: number): Promise<{
  user_id: number;
  email: string;
  message: string;
}> {
  return request(`/system/users/${userId}`, {
    method: "DELETE",
  });
}

export function batchDeleteUsers(userIds: number[]): Promise<{
  deleted_count: number;
  deleted_users: Array<{ id: number; email: string }>;
  not_found_ids: number[];
  message: string;
}> {
  return request("/system/users/batch-delete", {
    method: "POST",
    body: JSON.stringify({ user_ids: userIds }),
  });
}

