export interface SSHConfig {
  host: string;
  port: number;
  user: string;
  auth_type: "password" | "key";
  password?: string;
  private_key_path?: string;
  passphrase?: string;
  timeout: number;
}

export interface TestRunForm {
  engine: string;
  model: string;
  input_length: number;
  output_length: number;
  concurrency?: number | string;
  loop: number;
  warmup: boolean;
  execution_mode: "local" | "remote";
  scenario: "amaas" | "ft";
  ssh_config?: SSHConfig | null;

  // Appauto 版本配置
  appauto_branch?: string;

  // 模型启动配置
  auto_launch_model: boolean;
  model_config_name?: string;
  model_path?: string;
  model_tp: number;
  model_mode: string;
  model_port: number;
  model_host: string;
  stop_model_after_test: boolean;

  // AMaaS 特定配置
  amaas_ip?: string;
  amaas_api_port?: number;
  amaas_api_user?: string;
  amaas_api_passwd?: string;
  ssh_user?: string;
  ssh_password?: string;
  ssh_port?: number;
  request_number?: number | string;
  tokenizer_path?: string;
  debug?: boolean;

  // 正确性测试配置 (EvalScope)
  dataset?: string;
  dataset_args?: string;
  max_tokens?: number;
  eval_concurrency?: number;
  eval_limit?: number;
  temperature?: number;
  enable_thinking?: boolean;
  keep_model?: boolean;
  launch_timeout?: number;
}

export interface TestRunResponse {
  task_id: number;
  status: string;
  concurrency: number;
}

export interface TaskSummary {
  id: number;
  uuid: string;  // Task UUID for global uniqueness
  display_id?: number | null;  // User-friendly display ID
  engine: string;
  model: string;
  status: string;
  created_at: string;
  completed_at?: string | null;
  result_path?: string | null;
  archived_path?: string | null;
  error_message?: string | null;
  parameters: Record<string, unknown>;
  summary?: Record<string, unknown> | null;
  ssh_config?: Record<string, unknown> | null;
  user_id?: number | null;
  user_email?: string | null;
}

export interface TaskListResponse {
  items: TaskSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AuthResponse {
  user_id: number;
  email: string;
  token: string;
}

export interface Profile {
  user_id: number;
  email: string;
  role: string;  // "admin" or "user"
  created_at: string;
}

// 模型管理相关类型
export interface ModelInfo {
  name: string;
  path: string;
  size_gb?: number | null;
  family?: string;
  model_type?: string;
}

export interface ScanModelsResponse {
  models: ModelInfo[];
  total: number;
  base_dir: string;
}

export interface ModelInstanceResponse {
  id: number;
  model_name: string;
  model_family: string;
  model_type: string;
  engine: string;
  tp: number;
  mode: string;
  model_path: string;
  host: string;
  port: number;
  endpoint?: string | null;
  pid?: number | null;
  status: string;
  error_message?: string | null;
  ssh_config?: Record<string, unknown> | null;
  launch_command?: string | null;
  gpu_memory_gb?: number | null;
  gpu_ids?: string | null;
  last_health_check?: string | null;
  health_check_failures: number;
  created_at: string;
  started_at?: string | null;
  stopped_at?: string | null;
  updated_at: string;
  created_by?: string | null;
  is_remote: boolean;
  is_running: boolean;
  is_stopped: boolean;
}

export interface ModelInstanceListResponse {
  instances: ModelInstanceResponse[];
  total: number;
}

export interface HealthCheckResponse {
  instance_id: number;
  healthy: boolean;
  endpoint?: string | null;
  error?: string | null;
}

// 基础测试相关类型
export interface BasicTestForm {
  scenario: "amaas" | "ft";
  ssh_config: SSHConfig | null;

  // 测试配置
  testpaths?: string;
  case_level?: string;
  model_priority?: string;

  // 通知配置
  lark_user?: string;
  topic?: string;
  notify_group?: string;

  // 报告配置
  report_server?: string;
  report_url?: string;

  // 额外参数
  pytest_args?: string;
}

export interface BasicTestResponse {
  task_id: number;
  status: string;
  scenario: string;
}

export interface CancelTaskResponse {
  task_id: number;
  cancelled: boolean;
  message: string;
}

