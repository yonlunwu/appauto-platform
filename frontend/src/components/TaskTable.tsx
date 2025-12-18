import React from "react";
import { StatusBadge } from "./StatusBadge";
import { TaskSummary, Profile } from "../types";

// 列配置接口
export interface TaskTableColumn<T = TaskSummary> {
  key: string;  // 列的唯一标识
  label: string;  // 列标题
  render: (task: T, profile: Profile | null) => React.ReactNode;  // 自定义渲染函数
  style?: React.CSSProperties;  // 可选的单元格样式
  headerStyle?: React.CSSProperties;  // 可选的表头样式
}

// 操作按钮配置接口
export interface TaskTableAction {
  label: string;  // 按钮文本
  onClick: (task: TaskSummary) => void | Promise<void>;  // 点击事件，传入完整的 task 对象
  color?: string;  // 按钮颜色
  className?: string;  // 自定义 className
  condition?: (task: TaskSummary, profile: Profile | null) => boolean;  // 显示条件
  confirmMessage?: (task: TaskSummary) => string;  // 如果需要确认，提供确认消息生成函数
}

interface TaskTableProps {
  tasks: TaskSummary[];
  profile: Profile | null;
  columns: TaskTableColumn[];
  actions: TaskTableAction[];
  emptyMessage?: string;
  showTaskCount?: boolean;  // 是否显示任务计数
  taskCountLabel?: string;  // 任务计数标签（如 "本页任务共计"）
}

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  profile,
  columns,
  actions,
  emptyMessage = "暂无任务",
  showTaskCount = false,
  taskCountLabel = "任务共计",
}) => {
  const handleActionClick = async (action: TaskTableAction, task: TaskSummary) => {
    // 如果有确认消息，先弹出确认框
    if (action.confirmMessage) {
      const message = action.confirmMessage(task);
      if (!window.confirm(message)) {
        return;
      }
    }

    // 执行操作
    await action.onClick(task);
  };

  if (tasks.length === 0) {
    return (
      <p style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <>
      {showTaskCount && (
        <p style={{ marginBottom: "1rem", color: "#94a3b8", fontSize: "0.875rem" }}>
          {taskCountLabel} {tasks.length} 条
        </p>
      )}
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={column.headerStyle}>
                {column.label}
              </th>
            ))}
            {actions.length > 0 && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              {columns.map((column) => (
                <td key={`${task.id}-${column.key}`} style={column.style}>
                  {column.render(task, profile)}
                </td>
              ))}
              {actions.length > 0 && (
                <td>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {actions.map((action, index) => {
                      // 检查是否满足显示条件
                      if (action.condition && !action.condition(task, profile)) {
                        return null;
                      }

                      return (
                        <button
                          key={`${task.id}-action-${index}`}
                          className={action.className || "secondary"}
                          onClick={() => handleActionClick(action, task)}
                          style={action.color ? { color: action.color } : undefined}
                        >
                          {action.label}
                        </button>
                      );
                    })}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

// ==================== 通用列渲染函数 ====================
// 这些是常用的列渲染函数，可以直接使用

export const columnRenderers = {
  // ID 列（支持 display_id）
  id: (task: TaskSummary) => task.display_id || task.id,

  // UUID 列（显示前8位）
  uuid: (task: TaskSummary) => (
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
  ),

  // 引擎列
  engine: (task: TaskSummary) => task.engine,

  // 模型列
  model: (task: TaskSummary) => task.model,

  // 状态列（使用 StatusBadge）
  status: (task: TaskSummary) => <StatusBadge status={task.status} />,

  // 创建者列（当前用户高亮）
  creator: (task: TaskSummary, profile: Profile | null) => {
    if (task.user_email) {
      return (
        <span
          style={{
            color: task.user_id === profile?.user_id ? "#28a745" : "#666",
            fontWeight: task.user_id === profile?.user_id ? "600" : "normal",
          }}
        >
          {task.user_email}
        </span>
      );
    }
    return <span style={{ color: "#999" }}>未知</span>;
  },

  // 创建时间列
  createdAt: (task: TaskSummary) => new Date(task.created_at).toLocaleString(),

  // 完成时间列
  completedAt: (task: TaskSummary) =>
    task.completed_at ? new Date(task.completed_at).toLocaleString() : "-",

  // 数据集列（从 parameters 获取）
  dataset: (task: TaskSummary) => task.parameters?.dataset || "未知",

  // 任务类型列（从 parameters 获取）
  taskType: (task: TaskSummary) => task.parameters?.task_type || "-",

  // 操作列（从 parameters 获取）
  operation: (task: TaskSummary) => String(task.parameters?.operation || "-"),

  // 分支列（从 parameters 获取）
  branch: (task: TaskSummary) => String(task.parameters?.branch || "-"),

  // 得分列（用于正确性测试，有特殊渲染逻辑）
  score: (task: TaskSummary) => {
    if (task.status === "completed") {
      if (task.summary?.score !== undefined) {
        return (
          <span style={{ fontWeight: "600", color: "#28a745" }}>
            {task.summary.score}
          </span>
        );
      }
      return <span style={{ color: "#999" }}>-</span>;
    } else if (task.status === "running") {
      return <span style={{ color: "#856404" }}>计算中...</span>;
    }
    return <span style={{ color: "#999" }}>-</span>;
  },
};

// ==================== 通用操作条件函数 ====================

export const actionConditions = {
  // 只有任务所有者可以操作
  isOwner: (task: TaskSummary, profile: Profile | null) =>
    !task.user_id || task.user_id === profile?.user_id,

  // 任务有结果文件
  hasResult: (task: TaskSummary) => !!task.result_path,

  // 任务未归档且有结果
  canArchive: (task: TaskSummary) => !!task.result_path && !task.archived_path,

  // 任务正在运行或排队中
  isRunningOrQueued: (task: TaskSummary) =>
    task.status === "queued" || task.status === "running",

  // 任务失败
  isFailed: (task: TaskSummary) => task.status === "failed",

  // 任务正在运行
  isRunning: (task: TaskSummary) => task.status === "running",

  // 任务已完成
  isCompleted: (task: TaskSummary) => task.status === "completed",
};

// ==================== 通用确认消息生成函数 ====================

export const confirmMessages = {
  // 标准删除确认
  delete: (task: TaskSummary) => {
    const taskIdentifier = task.display_id || task.id;
    return `确定要删除任务 #${taskIdentifier} 吗？\n\n` +
      `引擎: ${task.engine}\n` +
      `模型: ${task.model}\n` +
      `状态: ${task.status}\n` +
      `UUID: ${task.uuid.substring(0, 8)}...\n\n` +
      `此操作不可撤销！`;
  },

  // 带数据集的删除确认（用于正确性测试）
  deleteWithDataset: (task: TaskSummary) => {
    const taskIdentifier = task.display_id || task.id;
    return `确定要删除任务 #${taskIdentifier} 吗？\n\n` +
      `数据集: ${task.parameters?.dataset || "未知"}\n` +
      `模型: ${task.model}\n` +
      `状态: ${task.status}\n` +
      `UUID: ${task.uuid.substring(0, 8)}...\n\n` +
      `此操作不可撤销！`;
  },

  // 部署任务删除确认
  deleteDeployment: (task: TaskSummary) => {
    const taskIdentifier = task.display_id || task.id;
    return `确定要删除任务 #${taskIdentifier} 吗？\n\n` +
      `类型: ${task.model}\n` +
      `状态: ${task.status}\n` +
      `UUID: ${task.uuid.substring(0, 8)}...\n\n` +
      `此操作不可撤销！`;
  },

  // 其他任务删除确认
  deleteOther: (task: TaskSummary) => {
    const taskIdentifier = task.display_id || task.id;
    return `确定要删除任务 #${taskIdentifier} 吗？\n\n` +
      `任务类型: ${task.parameters?.task_type || "hardware_info"}\n` +
      `状态: ${task.status}\n` +
      `UUID: ${task.uuid.substring(0, 8)}...\n\n` +
      `此操作不可撤销！`;
  },

  // 系统维护任务删除确认
  deleteSystem: (task: TaskSummary) => {
    const taskIdentifier = task.display_id || task.id;
    return `确定要删除任务 #${taskIdentifier} 吗？\n\n` +
      `操作: ${String(task.parameters?.operation || "-")}\n` +
      `分支: ${String(task.parameters?.branch || "-")}\n` +
      `状态: ${task.status}\n` +
      `UUID: ${task.uuid.substring(0, 8)}...\n\n` +
      `此操作不可撤销！`;
  },
};
