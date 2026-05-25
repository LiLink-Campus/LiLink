type AdminPaginationProps = {
  className: string;
  page: number;
  totalPages: number;
  total: number;
  unit?: string;
  onPageChange: (page: number) => void;
};

export function AdminPagination({
  className,
  page,
  totalPages,
  total,
  unit,
  onPageChange,
}: AdminPaginationProps) {
  return (
    <div className={className}>
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        上一页
      </button>
      <span>
        {page} / {totalPages} · 共 {total}
        {unit ? ` ${unit}` : null}
      </span>
      <button
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        下一页
      </button>
    </div>
  );
}
