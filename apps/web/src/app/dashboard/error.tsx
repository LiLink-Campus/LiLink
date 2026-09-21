"use client";

import { Button, Card } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function DashboardError({ reset }: { reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Card layout="plain">
      <h1>暂时无法加载</h1>
      <p>服务可能正在升级或暂时繁忙。你的账号和已保存的资料仍会保留，请稍后重试。</p>
      <Button disabled={pending} onClick={() => startTransition(() => {
        router.refresh();
        reset();
      })}>{pending ? "正在重新加载…" : "重新加载"}</Button>
    </Card>
  );
}
