"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import {
  GrassRowIllustration,
  OliveSprigIllustration,
} from "../dashboard/_components/illustrations";
import authStyles from "../auth.module.css";
import layoutStyles from "../public-layout.module.css";

type RegisterShellProps = {
  eyebrow: string;
  title: string;
  description: ReactNode;
  loginHref: string;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
};

export function RegisterShell({
  eyebrow,
  title,
  description,
  loginHref,
  backHref,
  backLabel = "返回选择注册方式",
  children,
}: RegisterShellProps) {
  return (
    <main
      className={`${layoutStyles.pageShell} ${layoutStyles.proseShell} ${authStyles.shell}`}
    >
      <Card className={`${authStyles.panel} animate-in`} layout="plain">
        <div className={authStyles.panelMark} aria-hidden="true">
          <OliveSprigIllustration />
        </div>
        {backHref ? (
          <p className={authStyles.backLink}>
            <Link href={backHref}>{backLabel}</Link>
          </p>
        ) : null}
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
        <p className={authStyles.hint}>
          已有账号？<Link href={loginHref}>立即登录</Link>
        </p>
      </Card>
      <div className={authStyles.grassLine} aria-hidden="true">
        <GrassRowIllustration />
      </div>
    </main>
  );
}
