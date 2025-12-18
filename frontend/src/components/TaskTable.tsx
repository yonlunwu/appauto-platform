import React, { useState, useMemo } from "react";
import { StatusBadge } from "./StatusBadge";
import { TaskSummary, Profile } from "../types";

// 排序方向
type SortDirection = "asc" | "desc";

// 排序类型
type SortType = "string" | "number" | "date";

// 列配置接口
export interface TaskTableColumn<T = TaskSummary> {
  key: string;  // 列的唯一标识
  label: string;  // 列标题
  render: (task: T, profile: Profile | null) => React.ReactNode;  // 自定义渲染函数
  style?: React.CSSProperties;  // 可选的单元格样式
  headerStyle?: React.CSSProperties;  // 可选的表头样式
  sortable?: boolean;  // 是否可排序
  sortKey?: string;  // 用于排序的字段路径（如 "created_at", "parameters.dataset"）
  sortType?: SortType;  // 排序类型，默认为 string
  sortValue?: (task: T) => any;  // 自定义排序值提取函数，优先级高于 sortKey
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

// 批量操作按钮配置接口
export interface TaskTableBatchAction {
  label: string;  // 按钮文本
  onClick: (tasks: TaskSummary[]) => void | Promise<void>;  // 点击事件，传入选中的任务列表
  color?: string;  // 按钮颜色
  className?: string;  // 自定义 className
  confirmMessage?: (tasks: TaskSummary[]) => string;  // 确认消息生成函数
  icon?: string;  // 可选的图标
}

interface TaskTableProps {
  tasks: TaskSummary[];
  profile: Profile | null;
  columns: TaskTableColumn[];
  actions: TaskTableAction[];
  emptyMessage?: string;
  showTaskCount?: boolean;  // 是否显示任务计数
  taskCountLabel?: string;  // 任务计数标签（如 "本页任务共计"）
  defaultSortColumn?: string;  // 默认排序列
  defaultSortDirection?: SortDirection;  // 默认排序方向
  enableSelection?: boolean;  // 是否启用行选中功能
  batchActions?: TaskTableBatchAction[];  // 批量操作按钮列表
  selectionFilter?: (task: TaskSummary, profile: Profile | null) => boolean;  // 哪些行可以选中（默认全部可选）
}

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  profile,
  columns,
  actions,
  emptyMessage = "暂无任务",
  showTaskCount = false,
  taskCountLabel = "任务共计",
  defaultSortColumn,
  defaultSortDirection = "desc",
  enableSelection = false,
  batchActions = [],
  selectionFilter,
}) => {
  // 排序状态
  const [sortColumn, setSortColumn] = useState<string | null>(defaultSortColumn || null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

  // 选中状态
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // 处理列标题点击
  const handleColumnClick = (column: TaskTableColumn) => {
    if (!column.sortable) return;

    if (sortColumn === column.key) {
      // 切换排序方向
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // 新列，默认降序
      setSortColumn(column.key);
      setSortDirection("desc");
    }
  };

  // 获取嵌套对象的值
  const getNestedValue = (obj: any, path: string): any => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  // 排序后的任务列表
  const sortedTasks = useMemo(() => {
    if (!sortColumn) return tasks;

    const column = columns.find(col => col.key === sortColumn);
    if (!column || !column.sortable) return tasks;

    const sorted = [...tasks].sort((a, b) => {
      // 获取排序值
      let aValue: any;
      let bValue: any;

      if (column.sortValue) {
        // 使用自定义排序值函数
        aValue = column.sortValue(a);
        bValue = column.sortValue(b);
      } else if (column.sortKey) {
        // 使用 sortKey 获取值
        aValue = getNestedValue(a, column.sortKey);
        bValue = getNestedValue(b, column.sortKey);
      } else {
        // 默认使用 key 作为字段名
        aValue = (a as any)[column.key];
        bValue = (b as any)[column.key];
      }

      // 处理 undefined/null
      if (aValue === undefined || aValue === null) return 1;
      if (bValue === undefined || bValue === null) return -1;

      // 根据类型排序
      const sortType = column.sortType || "string";
      let comparison = 0;

      if (sortType === "number") {
        comparison = Number(aValue) - Number(bValue);
      } else if (sortType === "date") {
        comparison = new Date(aValue).getTime() - new Date(bValue).getTime();
      } else {
        // string
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [tasks, sortColumn, sortDirection, columns]);

  // 可选择的任务列表
  const selectableTasks = useMemo(() => {
    if (!selectionFilter) return sortedTasks;
    return sortedTasks.filter(task => selectionFilter(task, profile));
  }, [sortedTasks, selectionFilter, profile]);

  // 获取选中的任务对象
  const selectedTasks = useMemo(() => {
    return sortedTasks.filter(task => selectedIds.has(task.id));
  }, [sortedTasks, selectedIds]);

  // 处理单行选中
  const handleRowSelect = (taskId: number, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(taskId);
    } else {
      newSelected.delete(taskId);
    }
    setSelectedIds(newSelected);
  };

  // 处理全选/取消全选
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allSelectableIds = selectableTasks.map(task => task.id);
      setSelectedIds(new Set(allSelectableIds));
    } else {
      setSelectedIds(new Set());
    }
  };

  // 判断任务是否可选
  const isTaskSelectable = (task: TaskSummary) => {
    if (!selectionFilter) return true;
    return selectionFilter(task, profile);
  };

  // 处理批量操作点击
  const handleBatchActionClick = async (action: TaskTableBatchAction) => {
    if (selectedTasks.length === 0) return;

    // 如果有确认消息，先弹出确认框
    if (action.confirmMessage) {
      const message = action.confirmMessage(selectedTasks);
      if (!window.confirm(message)) {
        return;
      }
    }

    // 执行批量操作
    await action.onClick(selectedTasks);

    // 操作完成后清空选中
    setSelectedIds(new Set());
  };

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
      {/* 批量操作栏 */}
      {enableSelection && batchActions.length > 0 && (
        <div style={{
          marginBottom: "1rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem",
          backgroundColor: selectedIds.size > 0 ? "#f0f9ff" : "transparent",
          borderRadius: "4px",
          transition: "background-color 0.2s",
        }}>
          <span style={{ color: "#666", fontSize: "0.875rem" }}>
            已选中 <strong>{selectedIds.size}</strong> 项
          </span>
          {selectedIds.size > 0 && batchActions.map((action, index) => (
            <button
              key={index}
              className={action.className || "secondary"}
              onClick={() => handleBatchActionClick(action)}
              style={action.color ? { color: action.color } : undefined}
            >
              {action.icon && <span style={{ marginRight: "0.25rem" }}>{action.icon}</span>}
              {action.label}
            </button>
          ))}
        </div>
      )}

      {showTaskCount && (
        <p style={{ marginBottom: "1rem", color: "#94a3b8", fontSize: "0.875rem" }}>
          {taskCountLabel} {tasks.length} 条
        </p>
      )}
      <table>
        <thead>
          <tr>
            {/* 全选checkbox */}
            {enableSelection && (
              <th style={{ width: "40px", textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={selectableTasks.length > 0 && selectedIds.size === selectableTasks.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
              </th>
            )}
            {columns.map((column) => (
              <th
                key={column.key}
                style={{
                  ...column.headerStyle,
                  cursor: column.sortable ? "pointer" : "default",
                  userSelect: "none",
                  position: "relative",
                }}
                onClick={() => handleColumnClick(column)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <span>{column.label}</span>
                  {column.sortable && sortColumn === column.key && (
                    <span style={{ fontSize: "0.75rem", color: "#666" }}>
                      {sortDirection === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th>
            ))}
            {actions.length > 0 && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map((task) => (
            <tr key={task.id}>
              {/* 行选中checkbox */}
              {enableSelection && (
                <td style={{ textAlign: "center" }}>
                  {isTaskSelectable(task) ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(task.id)}
                      onChange={(e) => handleRowSelect(task.id, e.target.checked)}
                      style={{ cursor: "pointer" }}
                    />
                  ) : (
                    <span style={{ color: "#ccc" }}>-</span>
                  )}
                </td>
              )}
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

// ==================== 通用列配置 ====================
// 提供常用列的完整配置（包括排序）

export const commonColumns = {
  id: {
    key: "id",
    label: "ID",
    render: (task: TaskSummary) => task.display_id || task.id,
    sortable: true,
    sortKey: "id",
    sortType: "number" as SortType,
  },
  uuid: {
    key: "uuid",
    label: "UUID",
    render: (task: TaskSummary) => (
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
    sortable: true,
    sortKey: "uuid",
    sortType: "string" as SortType,
  },
  engine: {
    key: "engine",
    label: "引擎",
    render: (task: TaskSummary) => task.engine,
    sortable: true,
    sortKey: "engine",
    sortType: "string" as SortType,
  },
  model: {
    key: "model",
    label: "模型",
    render: (task: TaskSummary) => task.model,
    sortable: true,
    sortKey: "model",
    sortType: "string" as SortType,
  },
  status: {
    key: "status",
    label: "状态",
    render: (task: TaskSummary) => <StatusBadge status={task.status} />,
    sortable: true,
    sortKey: "status",
    sortType: "string" as SortType,
  },
  creator: {
    key: "creator",
    label: "创建者",
    render: (task: TaskSummary, profile: Profile | null) => {
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
    sortable: true,
    sortKey: "user_email",
    sortType: "string" as SortType,
  },
  createdAt: {
    key: "createdAt",
    label: "创建时间",
    render: (task: TaskSummary) => new Date(task.created_at).toLocaleString(),
    sortable: true,
    sortKey: "created_at",
    sortType: "date" as SortType,
  },
  completedAt: {
    key: "completedAt",
    label: "完成时间",
    render: (task: TaskSummary) =>
      task.completed_at ? new Date(task.completed_at).toLocaleString() : "-",
    sortable: true,
    sortKey: "completed_at",
    sortType: "date" as SortType,
  },
  dataset: {
    key: "dataset",
    label: "数据集",
    render: (task: TaskSummary) => task.parameters?.dataset || "未知",
    sortable: true,
    sortKey: "parameters.dataset",
    sortType: "string" as SortType,
  },
  taskType: {
    key: "taskType",
    label: "任务类型",
    render: (task: TaskSummary) => task.parameters?.task_type || "-",
    sortable: true,
    sortKey: "parameters.task_type",
    sortType: "string" as SortType,
  },
  operation: {
    key: "operation",
    label: "操作",
    render: (task: TaskSummary) => String(task.parameters?.operation || "-"),
    sortable: true,
    sortKey: "parameters.operation",
    sortType: "string" as SortType,
  },
  branch: {
    key: "branch",
    label: "分支",
    render: (task: TaskSummary) => String(task.parameters?.branch || "-"),
    sortable: true,
    sortKey: "parameters.branch",
    sortType: "string" as SortType,
  },
  score: {
    key: "score",
    label: "得分",
    render: (task: TaskSummary) => {
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
    sortable: true,
    sortKey: "summary.score",
    sortType: "number" as SortType,
    headerStyle: { minWidth: "80px" },
  },
};

// ==================== 通用列渲染函数（向后兼容）====================
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

// ==================== 批量操作确认消息生成函数 ====================

export const batchConfirmMessages = {
  // 批量删除确认
  batchDelete: (tasks: TaskSummary[]) => {
    const count = tasks.length;
    const taskList = tasks.slice(0, 5).map(task => {
      const id = task.display_id || task.id;
      return `  - #${id}: ${task.model} (${task.status})`;
    }).join('\n');

    const more = count > 5 ? `\n  ... 还有 ${count - 5} 个任务` : '';

    return `确定要批量删除 ${count} 个任务吗？\n\n${taskList}${more}\n\n此操作不可撤销！`;
  },
};
