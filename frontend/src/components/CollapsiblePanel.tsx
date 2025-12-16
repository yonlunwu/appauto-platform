import React from "react";

interface CollapsiblePanelProps {
  id: string;
  title: string;
  icon?: string;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

/**
 * 可折叠面板组件
 *
 * @param id - 面板唯一标识
 * @param title - 面板标题
 * @param icon - 标题前的 emoji 图标（可选）
 * @param isExpanded - 是否展开
 * @param onToggle - 切换展开/折叠的回调函数
 * @param children - 面板内容
 */
export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  id,
  title,
  icon,
  isExpanded,
  onToggle,
  children,
}) => {
  return (
    <section className="panel">
      <div
        className="collapsible-header"
        onClick={() => onToggle(id)}
        style={{
          cursor: "pointer",
          padding: "1rem",
          borderBottom: isExpanded ? "1px solid #e0e0e0" : "none",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2 style={{ margin: 0 }}>
          {icon && `${icon} `}
          {title}
        </h2>
        <span style={{ fontSize: "1.5rem" }}>
          {isExpanded ? "▼" : "▶"}
        </span>
      </div>

      {isExpanded && (
        <div style={{ padding: "1.5rem" }}>
          {children}
        </div>
      )}
    </section>
  );
};
