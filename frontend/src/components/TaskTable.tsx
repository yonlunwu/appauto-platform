import React from "react";
import { StatusBadge } from "./StatusBadge";
import { TaskSummary, Profile } from "../types";

interface TaskTableProps {
  tasks: TaskSummary[];
  profile: Profile | null;
  onDownload: (taskId: number) => void;
  onPreview: (taskId: number) => void;
  onArchive: (taskId: number) => void;
  onViewLogs: (taskId: number) => void;
  onRetry: (taskId: number) => void;
  onCancel: (taskId: number) => void;
  onDelete: (taskId: number) => void;
  emptyMessage?: string;
}

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  profile,
  onDownload,
  onPreview,
  onArchive,
  onViewLogs,
  onRetry,
  onCancel,
  onDelete,
  emptyMessage = "暂无任务",
}) => {
  const handleDeleteClick = (task: TaskSummary) => {
    const taskIdentifier = task.display_id || task.id;
    const confirmMessage = `确定要删除任务 #${taskIdentifier} 吗？\n\n` +
      `引擎: ${task.engine}\n` +
      `模型: ${task.model}\n` +
      `状态: ${task.status}\n` +
      `UUID: ${task.uuid.substring(0, 8)}...\n\n` +
      `此操作不可撤销！`;

    if (window.confirm(confirmMessage)) {
      onDelete(task.id);
    }
  };

  if (tasks.length === 0) {
    return (
      <p style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
        {emptyMessage}
      </p>
    );
  }

  return (
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
        {tasks.map((task) => (
          <tr key={task.id}>
            <td>{task.display_id || task.id}</td>
            <td>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  color: "#666",
                }}
                title={task.uuid}
              >
                {task.uuid.substring(0, 8)}
              </span>
            </td>
            <td>{task.engine}</td>
            <td>{task.model}</td>
            <td>
              <StatusBadge status={task.status} />
            </td>
            <td>
              {task.user_email ? (
                <span
                  style={{
                    color: task.user_id === profile?.user_id ? "#28a745" : "#666",
                    fontWeight: task.user_id === profile?.user_id ? "600" : "normal",
                  }}
                >
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
                    onClick={() => onDownload(task.id)}
                  >
                    下载
                  </button>
                )}
                {task.result_path && (
                  <button
                    className="secondary"
                    onClick={() => onPreview(task.id)}
                    style={{ color: "#17a2b8" }}
                  >
                    预览
                  </button>
                )}
                {task.result_path && !task.archived_path && (
                  <button
                    className="secondary"
                    onClick={() => onArchive(task.id)}
                  >
                    归档
                  </button>
                )}
                <button
                  className="secondary"
                  onClick={() => onViewLogs(task.id)}
                  style={{ color: "#007bff" }}
                >
                  日志
                </button>
                <button
                  className="secondary"
                  onClick={() => onRetry(task.id)}
                  style={{ color: "#28a745" }}
                >
                  重试
                </button>
                {(!task.user_id || task.user_id === profile?.user_id) &&
                  (task.status === "queued" || task.status === "running") && (
                    <button
                      className="secondary"
                      onClick={() => onCancel(task.id)}
                      style={{ color: "#ff9800" }}
                    >
                      取消
                    </button>
                  )}
                {(!task.user_id || task.user_id === profile?.user_id) && (
                  <button
                    className="secondary"
                    onClick={() => handleDeleteClick(task)}
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
  );
};
