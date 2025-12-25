import React, { useState } from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  const [jumpToPage, setJumpToPage] = useState<string>("");

  if (totalPages <= 1) {
    return null;
  }

  // 处理页面跳转
  const handleJumpToPage = () => {
    const pageNum = parseInt(jumpToPage);
    if (isNaN(pageNum)) {
      alert("请输入有效的页码");
      return;
    }
    if (pageNum < 1) {
      alert("页码不能小于 1");
      return;
    }
    if (pageNum > totalPages) {
      alert(`页码不能大于总页数 ${totalPages}`);
      return;
    }
    onPageChange(pageNum);
    setJumpToPage(""); // 清空输入框
  };

  // 处理回车键
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleJumpToPage();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "1rem",
        marginTop: "1.5rem",
        paddingTop: "1rem",
        borderTop: "1px solid #e0e0e0",
      }}
    >
      <button
        className="secondary"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        style={{
          opacity: currentPage === 1 ? 0.5 : 1,
          cursor: currentPage === 1 ? "not-allowed" : "pointer",
        }}
      >
        上一页
      </button>
      <span style={{ color: "#666" }}>
        第 {currentPage} / {totalPages} 页
      </span>
      <button
        className="secondary"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        style={{
          opacity: currentPage === totalPages ? 0.5 : 1,
          cursor: currentPage === totalPages ? "not-allowed" : "pointer",
        }}
      >
        下一页
      </button>

      {/* 页面跳转功能 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginLeft: "1rem",
          paddingLeft: "1rem",
          borderLeft: "1px solid #e0e0e0",
        }}
      >
        <span style={{ color: "#666", fontSize: "0.875rem" }}>跳转到</span>
        <input
          type="number"
          min="1"
          max={totalPages}
          value={jumpToPage}
          onChange={(e) => setJumpToPage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="页码"
          style={{
            width: "60px",
            padding: "0.25rem 0.5rem",
            fontSize: "0.875rem",
            border: "1px solid #d0d0d0",
            borderRadius: "4px",
            textAlign: "center",
          }}
        />
        <span style={{ color: "#666", fontSize: "0.875rem" }}>页</span>
        <button
          className="secondary"
          onClick={handleJumpToPage}
          style={{
            padding: "0.25rem 0.75rem",
            fontSize: "0.875rem",
          }}
        >
          跳转
        </button>
      </div>
    </div>
  );
};
