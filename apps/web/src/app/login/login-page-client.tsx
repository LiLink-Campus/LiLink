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
import authStyles from "../auth.module.css";
import layoutStyles from "../public-layout.module.css";

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
      <Card className={`${authStyles.panel} animate-in`} layout="plain">
        <div className={authStyles.panelMark} aria-hidden="true">
          <OliveSprigIllustration />
        </div>
        <p className="eyebrow">Login</p>
        <h1>回到本周轮次</h1>
        <p>输入已注册的邮箱，我们来验证你的身份。</p>
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
        <p className={authStyles.hint}>
          <Link href="/forgot-password">忘记密码？</Link>
        </p>
        <p className={authStyles.hint}>
          还没有账号？<Link href={registerHref}>立即注册</Link>
        </p>
      </Card>
      <div className={authStyles.grassLine} aria-hidden="true">
        <GrassRowIllustration />
      </div>
    </main>
  );
}
