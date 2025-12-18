import React, { useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
  minWidth?: string;
  theme?: "light" | "dark";
  showCloseButton?: boolean;
  headerActions?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "95%",
  minWidth,
  theme = "light",
  showCloseButton = true,
  headerActions,
}) => {
  // 监听 ESC 键关闭弹窗
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.keyCode === 27) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme === "dark" ? "#2a2a2a" : "white",
          padding: "2rem",
          borderRadius: "8px",
          maxWidth,
          minWidth,
          maxHeight: "90%",
          overflow: "auto",
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || showCloseButton || headerActions) && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1.5rem",
            }}
          >
            {title && (
              <h2
                style={{
                  margin: 0,
                  color: theme === "dark" ? "#f0f0f0" : "#1a1a1a",
                  fontSize: "1.5rem",
                }}
              >
                {title}
              </h2>
            )}
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              {headerActions}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  style={{
                    padding: "0.5rem 1rem",
                    cursor: "pointer",
                    border: "1px solid #d0d0d0",
                    borderRadius: "4px",
                    backgroundColor: "#f8f9fa",
                    color: "#333",
                    fontWeight: "500",
                  }}
                >
                  关闭
                </button>
              )}
            </div>
          </div>
        )}
        <div>{children}</div>
      </div>
    </div>
  );
};
