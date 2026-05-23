"use client";

import { sanitizeSameOriginRelativePath } from "@lilink/shared";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Button, Card, Field, FormMessage, Input } from "@/components/ui";
import { fetchApi } from "../../lib/api";
import {
  GrassRowIllustration,
  OliveSprigIllustration,
} from "../dashboard/_components/illustrations";

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
    <main className="page-shell prose-shell auth-shell">
      <Card className="auth-panel animate-in" layout="plain">
        <div className="auth-panel-mark" aria-hidden="true">
          <OliveSprigIllustration />
        </div>
        <p className="eyebrow">Login</p>
        <h1>回到本周轮次</h1>
        <p>使用你的学校邮箱和密码登录，继续上一次未完成的匹配。</p>
        <form className="auth-stack" onSubmit={handleSubmit}>
          <Field label="学校邮箱">
            <Input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="your.name@school.edu"
            />
          </Field>
          <Field label="密码">
            <Input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              maxLength={PASSWORD_MAX_LENGTH}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位，含字母和数字"
            />
          </Field>
          {error ? <FormMessage>{error}</FormMessage> : null}
          <Button
            block
            disabled={pending}
            type="submit"
          >
            {pending ? "登录中…" : "登录"}
          </Button>
        </form>
        <p className="auth-hint">
          <Link href="/forgot-password">忘记密码？</Link>
        </p>
        <p className="auth-hint">
          还没有账号？<Link href={registerHref}>立即注册</Link>
        </p>
      </Card>
      <div className="auth-grass-line" aria-hidden="true">
        <GrassRowIllustration />
      </div>
    </main>
  );
}
