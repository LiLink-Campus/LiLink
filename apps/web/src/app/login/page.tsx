"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { fetchApi } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
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
      router.push("/dashboard");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "登录失败，请重试。",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="page-shell prose-shell">
      <section className="content-panel auth-panel">
        <p className="eyebrow">Login</p>
        <h1>回到本周轮次</h1>
        <p>使用你的学校邮箱和密码登录</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>学校邮箱</span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="your.name@school.edu"
            />
          </label>
          <label>
            <span>密码</span>
            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位，含字母和数字"
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="button-primary" disabled={pending} type="submit">
            {pending ? "登录中..." : "登录"}
          </button>
        </form>
        <p className="auth-hint">
          还没有账号？<Link href="/register">立即注册</Link>
        </p>
      </section>
    </main>
  );
}
