import Link from "next/link";
import styles from "./updates.module.css";

type UpdatesPaginationProps = {
  page: number;
  totalPages: number;
  totalItems: number;
};

function pageHref(page: number): string {
  return page <= 1 ? "/updates" : `/updates?page=${page}`;
}

export function UpdatesPagination({
  page,
  totalPages,
  totalItems,
}: UpdatesPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className={styles.pagination} aria-label="更新列表分页">
      {page > 1 ? (
        <Link href={pageHref(page - 1)} className={styles.paginationButton}>
          上一页
        </Link>
      ) : (
        <span className={styles.paginationButtonDisabled} aria-hidden="true">
          上一页
        </span>
      )}
      <span className={styles.paginationMeta}>
        第 {page} / {totalPages} 页 · 共 {totalItems} 条
      </span>
      {page < totalPages ? (
        <Link href={pageHref(page + 1)} className={styles.paginationButton}>
          下一页
        </Link>
      ) : (
        <span className={styles.paginationButtonDisabled} aria-hidden="true">
          下一页
        </span>
      )}
    </nav>
  );
}
