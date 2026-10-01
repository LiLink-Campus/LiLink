import { cx } from "@/lib/cx";
import type { ComponentPropsWithoutRef } from "react";

export type ActionGroupProps = ComponentPropsWithoutRef<"div">;

export function ActionGroup({ className, ...props }: ActionGroupProps) {
  return <div className={cx("semantic-action-group", className)} {...props} />;
}
