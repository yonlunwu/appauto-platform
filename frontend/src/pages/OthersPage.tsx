import React from "react";
import { CollapsiblePanel, Pagination } from "../components";
import { collectHardwareInfo, deleteTask, downloadUrl, fetchTaskLogs } from "../api";
import { TaskSummary, Profile } from "../types";
import { UsePaginationReturn } from "../hooks/usePagination";
import { UseModalReturn } from "../hooks/useModal";

interface OthersPageProps {
  expandedSection: string | null;
  togglePanel: (panelId: string) => void;

  // Hardware info form state
  sshHost: string;
  setSshHost: (value: string) => void;
  sshUser: string;
  setSshUser: (value: string) => void;
  sshPassword: string;
  setSshPassword: (value: string) => void;
  sshPort: string;
  setSshPort: (value: string) => void;
  showSshPassword: boolean;
  setShowSshPassword: (value: boolean) => void;

  // Notification state
  error: string | null;
  setError: (value: string | null) => void;
  success: string | null;
  setSuccess: (value: string | null) => void;

  // Tasks data
  othersTasks: TaskSummary[];
  loadOthersTasks: () => Promise<void>;
  profile: Profile | null;
  othersPagination: UsePaginationReturn;

  // Modal and logs
  handlePreview: (taskId: number) => void;
  setLogsTaskId: (taskId: number | null) => void;
  logsTaskIdRef: React.MutableRefObject<number | null>;
  logsModal: UseModalReturn;
  setCurrentLogs: (logs: string) => void;
}

export const OthersPage: React.FC<OthersPageProps> = ({
  expandedSection,
  togglePanel,
  sshHost,
  setSshHost,
  sshUser,
  setSshUser,
  sshPassword,
  setSshPassword,
  sshPort,
  setSshPort,
  showSshPassword,
  setShowSshPassword,
  error,
  setError,
  success,
  setSuccess,
  othersTasks,
  loadOthersTasks,
  profile,
  othersPagination,
  handlePreview,
  setLogsTaskId,
  logsTaskIdRef,
  logsModal,
  setCurrentLogs,
}) => {
  return (
    <div>
      {/* 硬件信息收集 */}
      <CollapsiblePanel
        id="hardware-info"
        title="硬件信息收集"
        icon="🔍"
        isExpanded={expandedSection === "hardware-info"}
        onToggle={togglePanel}
      >
        <p style={{ color: "#666", marginTop: "0", marginBottom: "1rem", fontSize: "0.9rem" }}>
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
      </CollapsiblePanel>

      {/* 其他任务列表 */}
      <section className="panel" style={{ marginTop: "1rem" }}>
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
                          logsModal.open();
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
        <Pagination
          currentPage={othersPagination.currentPage}
          totalPages={othersPagination.totalPages}
          onPageChange={othersPagination.setCurrentPage}
        />
      </section>
    </div>
  );
};
