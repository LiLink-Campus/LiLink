"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import authStyles from "../auth.module.css";
import layoutStyles from "../public-layout.module.css";
import styles from "./register-flow.module.css";

type RegisterShellProps = {
  eyebrow: string;
  className?: string;
  step?: 1 | 2;
  title: string;
  description: ReactNode;
  loginHref: string;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
};

export function RegisterShell({
  eyebrow,
  className = "",
  step,
  title,
  description,
  loginHref,
  backHref,
  backLabel = "注册方式",
  children,
}: RegisterShellProps) {
  return (
    <main
      className={`${layoutStyles.pageShell} ${layoutStyles.proseShell} ${authStyles.shell} ${styles.shell}`}
    >
      <ol className={styles.progress} aria-label="注册步骤">
        {["注册方式", "邮箱验证", "设置账号"].map((label, index) => {
          const current = step ?? 0;
          return <li key={label} className={index <= current ? styles.active : undefined} aria-current={index === current ? "step" : undefined}>
            <span className={styles.dot}>{index < current ? "✓" : index + 1}</span><span>{label}</span>
          </li>;
        })}
      </ol>
      <Card className={`${authStyles.panel} ${styles.panel} ${className} animate-in`} layout="plain">
        {backHref ? (
          <p className={authStyles.backLink}>
            <Link href={backHref}>← {backLabel}</Link>
          </p>
        ) : null}
        {!step && eyebrow ? <p className={authStyles.eyebrow}>{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {children}
        <p className={authStyles.hint}>
          已有账号？<Link href={loginHref}>立即登录</Link>
        </p>
      </Card>
    </main>
  );
}
