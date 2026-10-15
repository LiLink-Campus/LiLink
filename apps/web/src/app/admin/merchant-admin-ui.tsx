"use client";

import { cx } from "./admin-class-names";
import commonStyles from "./admin-common.module.css";
import cardStyles from "./admin-card.module.css";
import merchantStyles from "./merchant-admin.module.css";

const adminStyles = [commonStyles, cardStyles, merchantStyles];

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  ACTIVE: "进行中",
  ENDED: "已结束",
};

export function AdminRefreshButton({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={cx(adminStyles, "ui-button ui-button--secondary mp-refresh-btn")}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      刷新
    </button>
  );
}
