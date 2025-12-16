import { useState } from "react";

interface UsePaginationReturn {
  currentPage: number;
  totalPages: number;
  totalTasks: number;
  setCurrentPage: (page: number) => void;
  setTotalPages: (pages: number) => void;
  setTotalTasks: (tasks: number) => void;
  resetPagination: () => void;
}

export const usePagination = (
  initialPage: number = 1
): UsePaginationReturn => {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);

  const resetPagination = () => {
    setCurrentPage(initialPage);
    setTotalPages(0);
    setTotalTasks(0);
  };

  return {
    currentPage,
    totalPages,
    totalTasks,
    setCurrentPage,
    setTotalPages,
    setTotalTasks,
    resetPagination,
  };
};
