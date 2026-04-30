"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { fetchApi } from "../../lib/api";
import {
  GrassRowIllustration,
  OliveSprigIllustration,
} from "../dashboard/_components/illustrations";
import { useLocale } from "../locale-context";

const PASSWORD_MAX_LENGTH = 128;
const LOGIN_COPY = {
  "zh-CN": {
    fallbackError: "登录失败，请重试。",
    title: "回到本周轮次",
    intro: "使用你的学校邮箱和密码登录，继续上一次未完成的匹配。",
    email: "学校邮箱",
    password: "密码",
    passwordPlaceholder: "至少 8 位，含字母和数字",
    submitting: "登录中…",
    submit: "登录",
    forgot: "忘记密码？",
    signupPrefix: "还没有账号？",
    signup: "立即注册",
  },
  "en-US": {
    fallbackError: "Login failed. Please try again.",
    title: "Return to this week's round",
    intro:
      "Log in with your school email and password to continue your matching flow.",
    email: "School email",
    password: "Password",
    passwordPlaceholder: "At least 8 characters with letters and numbers",
    submitting: "Logging in...",
    submit: "Log in",
    forgot: "Forgot password?",
    signupPrefix: "No account yet?",
    signup: "Register now",
  },
} as const;

export default function LoginPageClient() {
  const { locale } = useLocale();
  const copy = LOGIN_COPY[locale];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
        nextPath && nextPath.startsWith("/") ? nextPath : "/dashboard";
      window.location.href = redirectPath;
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : copy.fallbackError,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="page-shell prose-shell auth-shell">
      <section className="content-panel auth-panel animate-in">
        <div className="auth-panel-mark" aria-hidden="true">
          <OliveSprigIllustration />
        </div>
        <p className="eyebrow">Login</p>
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>{copy.email}</span>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="your.name@school.edu"
            />
          </label>
          <label>
            <span>{copy.password}</span>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              maxLength={PASSWORD_MAX_LENGTH}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={copy.passwordPlaceholder}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button
            className="button-primary button-block"
            disabled={pending}
            type="submit"
          >
            {pending ? copy.submitting : copy.submit}
          </button>
        </form>
        <p className="auth-hint">
          <Link href="/forgot-password">{copy.forgot}</Link>
        </p>
        <p className="auth-hint">
          {copy.signupPrefix} <Link href="/register">{copy.signup}</Link>
        </p>
      </section>
      <div className="auth-grass-line" aria-hidden="true">
        <GrassRowIllustration />
      </div>
    </main>
  );
}
