import React from "react";
import { CollapsiblePanel, TaskTable, Pagination } from "../components";
import { TaskTableColumn, TaskTableAction, columnRenderers, actionConditions, confirmMessages } from "../components/TaskTable";
import { TaskSummary, Profile } from "../types";
import { updateAppauto, fetchTaskLogs, deleteTask, UserInfo } from "../api";
import { UsePaginationReturn } from "../hooks/usePagination";
import { UseModalReturn } from "../hooks/useModal";

interface SystemManagementPageProps {
  expandedSection: string | null;
  togglePanel: (panelId: string) => void;

  // Appauto version management
  appautoVersions: any[];
  appautoPath: string;
  updateBranch: string;
  setUpdateBranch: (branch: string) => void;

  // User management
  users: UserInfo[];
  loadingUsers: boolean;
  selectedUserIds: Set<number>;
  profile: Profile | null;

  // Functions
  loadSystemTasks: () => Promise<void>;
  loadUsers: () => Promise<void>;
  toggleUserSelection: (userId: number) => void;
  toggleSelectAll: () => void;
  handleUpdateUserRole: (userId: number, newRole: string) => void;
  handleResetPassword: (userId: number, email: string, newPassword: string) => void;
  handleDeleteUser: (userId: number, userEmail: string) => void;
  handleBatchDeleteUsers: () => void;

  // System tasks
  systemTasks: TaskSummary[];
  systemPagination: UsePaginationReturn;

  // Logs modal
  setLogsTaskId: (taskId: number) => void;
  logsTaskIdRef: React.MutableRefObject<number | null>;
  logsModal: UseModalReturn;
  setCurrentLogs: (logs: string) => void;
}

export const SystemManagementPage: React.FC<SystemManagementPageProps> = ({
  expandedSection,
  togglePanel,
  appautoVersions,
  appautoPath,
  updateBranch,
  setUpdateBranch,
  users,
  loadingUsers,
  selectedUserIds,
  profile,
  loadSystemTasks,
  loadUsers,
  toggleUserSelection,
  toggleSelectAll,
  handleUpdateUserRole,
  handleResetPassword,
  handleDeleteUser,
  handleBatchDeleteUsers,
  systemTasks,
  systemPagination,
  setLogsTaskId,
  logsTaskIdRef,
  logsModal,
  setCurrentLogs,
}) => {
  return (
    <div>
      {/* 系统管理 */}
      <CollapsiblePanel
        id="system-management"
        title="系统管理"
        icon="⚙️"
        isExpanded={expandedSection === "system-management"}
        onToggle={togglePanel}
      >
            <h3 style={{ marginTop: "0", marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>Appauto 版本管理</h3>
            <p style={{ color: "#666", marginBottom: "1rem" }}>
              当前 Appauto 路径: {appautoPath || "加载中..."}
            </p>

            <div style={{ marginBottom: "2rem" }}>
              <h4 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.875rem", fontWeight: "600" }}>已安装版本</h4>
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
          <h4 style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.875rem", fontWeight: "600" }}>更新 Appauto</h4>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <select
              value={updateBranch}
              onChange={(e) => setUpdateBranch(e.target.value)}
              style={{ flex: 1, padding: "0.5rem" }}
              disabled={appautoVersions.length === 0}
            >
              {appautoVersions.length === 0 ? (
                <option value="">暂无可用版本</option>
              ) : (
                appautoVersions.map((v: any) => (
                  <option key={v.branch} value={v.branch}>
                    {v.branch}
                  </option>
                ))
              )}
            </select>
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
              disabled={!updateBranch || appautoVersions.length === 0}
            >
              更新
            </button>
          </div>
        </div>
      </CollapsiblePanel>

      {/* 用户管理 */}
      <div style={{ marginTop: "1rem" }}>
        <CollapsiblePanel
          id="user-management"
          title="用户管理"
          icon="👥"
          isExpanded={expandedSection === "user-management"}
          onToggle={togglePanel}
        >
            <div style={{ marginTop: "0", marginBottom: "1rem", display: "flex", gap: "1rem", alignItems: "center" }}>
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
        </CollapsiblePanel>
      </div>

      {/* 系统维护任务列表 */}
      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>系统维护任务列表</h2>
        <TaskTable
          tasks={systemTasks}
          profile={profile}
          columns={[
            { key: "id", label: "ID", render: columnRenderers.id },
            { key: "status", label: "状态", render: columnRenderers.status },
            { key: "operation", label: "操作", render: columnRenderers.operation },
            { key: "branch", label: "分支", render: columnRenderers.branch },
            { key: "creator", label: "创建者", render: columnRenderers.creator },
            { key: "createdAt", label: "创建时间", render: columnRenderers.createdAt },
            { key: "completedAt", label: "完成时间", render: columnRenderers.completedAt },
          ]}
          actions={[
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
                  await loadSystemTasks();
                } catch (err) {
                  alert(err instanceof Error ? err.message : "删除失败");
                }
              },
              color: "#dc3545",
              condition: actionConditions.isOwner,
              confirmMessage: confirmMessages.deleteSystem,
            },
          ]}
          emptyMessage="暂无系统维护任务"
        />

        {/* 分页控件 */}
        <Pagination
          currentPage={systemPagination.currentPage}
          totalPages={systemPagination.totalPages}
          onPageChange={systemPagination.setCurrentPage}
        />
      </section>
    </div>
  );
};
