"use client";

import { sanitizeSameOriginRelativePath } from "@lilink/shared";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Button, Card, Field, FormMessage, Input } from "@/components/ui";
import { fetchApi } from "../../lib/api";
import authStyles from "../auth.module.css";
import layoutStyles from "../public-layout.module.css";
import styles from "./login.module.css";

const PASSWORD_MAX_LENGTH = 128;

function registerHrefFromSearch(search: string) {
  const nextPath = new URLSearchParams(search).get("next");
  if (!nextPath) {
    return "/register";
  }

  return `/register?${new URLSearchParams({ next: nextPath }).toString()}`;
}

export default function LoginPageClient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [registerHref, setRegisterHref] = useState("/register");

  useEffect(() => {
    setRegisterHref(registerHrefFromSearch(window.location.search));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await fetchApi("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const nextPath = new URLSearchParams(window.location.search).get("next");
      const redirectPath =
        sanitizeSameOriginRelativePath(nextPath, window.location.origin) ??
        "/dashboard";
      window.location.href = redirectPath;
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "登录失败，请重试。",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main
      className={`${layoutStyles.pageShell} ${layoutStyles.proseShell} ${authStyles.shell}`}
    >
      <Card className={`${authStyles.panel} ${styles.card} animate-in`} layout="plain">
        <h1>欢迎回来</h1>
        <form className={authStyles.stack} onSubmit={handleSubmit}>
          <Field label="邮箱">
            <Input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </Field>
          <div className={styles.passwordField}>
            <Link className={styles.forgot} href="/forgot-password">忘记密码？</Link>
          <Field label="密码">
            <Input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              maxLength={PASSWORD_MAX_LENGTH}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入你的密码"
            />
          </Field>
          </div>
          {error ? <FormMessage>{error}</FormMessage> : null}
          <Button
            block
            disabled={pending}
            type="submit"
          >
            {pending ? "登录中…" : "登录"}
          </Button>
        </form>
        <p className={authStyles.hint}>
          还没有账号？<Link href={registerHref}>立即注册</Link>
        </p>
      </Card>
    </main>
  );
}
