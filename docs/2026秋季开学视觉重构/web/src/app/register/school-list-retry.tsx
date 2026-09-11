"use client";

import { Button, FormMessage } from "@/components/ui";
import authStyles from "../auth.module.css";

export function SchoolListRetry({
  message,
  pending,
  onRetry,
}: {
  message: string;
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <div className={authStyles.schoolListRetry}>
      <FormMessage>{message}</FormMessage>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={onRetry}
      >
        {pending ? "重试中…" : "重试加载学校列表"}
      </Button>
    </div>
  );
}
