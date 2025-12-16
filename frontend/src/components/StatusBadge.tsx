import React from "react";

type TaskStatus = "pending" | "queued" | "running" | "completed" | "failed" | "canceled";

interface StatusBadgeProps {
  status: TaskStatus;
}

const STATUS_STYLES: Record<TaskStatus, { bg: string; color: string }> = {
  completed: { bg: "#d1f2eb", color: "#0d6832" },
  running: { bg: "#fff3cd", color: "#856404" },
  failed: { bg: "#f8d7da", color: "#721c24" },
  queued: { bg: "#e2e3e5", color: "#383d41" },
  pending: { bg: "#e2e3e5", color: "#383d41" },
  canceled: { bg: "#e2e3e5", color: "#383d41" },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;

  return (
    <span
      style={{
        padding: "0.25rem 0.5rem",
        borderRadius: "4px",
        fontSize: "0.875rem",
        fontWeight: "600",
        backgroundColor: style.bg,
        color: style.color,
      }}
    >
      {status}
    </span>
  );
};
