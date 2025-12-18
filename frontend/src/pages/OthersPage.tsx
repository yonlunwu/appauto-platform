import React from "react";
import { CollapsiblePanel, TaskTable, Pagination } from "../components";
import { TaskTableColumn, TaskTableAction, commonColumns, actionConditions, confirmMessages, batchConfirmMessages } from "../components/TaskTable";
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0 }}>其他任务列表</h2>
          <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
            本页任务共计 {othersTasks.length} 条
          </span>
        </div>
        <TaskTable
          tasks={othersTasks}
          profile={profile}
          columns={[
            commonColumns.id,
            commonColumns.status,
            commonColumns.taskType,
            commonColumns.creator,
            commonColumns.createdAt,
            commonColumns.completedAt,
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
                await Promise.all(selectedTasks.map(task => deleteTask(task.id)));
                await loadOthersTasks();
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
              label: "日志",
              onClick: async (task) => {
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
              },
              color: "#007bff",
            },
            {
              label: "删除",
              onClick: async (task) => {
                try {
                  await deleteTask(task.id);
                  await loadOthersTasks();
                } catch (err) {
                  alert(err instanceof Error ? err.message : "删除失败");
                }
              },
              color: "#dc3545",
              condition: actionConditions.isOwner,
              confirmMessage: confirmMessages.deleteOther,
            },
          ]}
          emptyMessage="暂无其他任务"
        />

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
