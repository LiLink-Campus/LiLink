"use client";

import { FormEvent, useState } from "react";
import { merchantLogin } from "../../../lib/api";

export default function MerchantLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await merchantLogin(email.trim(), password);
      window.location.href = "/merchant/redeem";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败，请重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>商家核销登录</h1>
      <form
        onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="商家账号邮箱"
          autoComplete="username"
          required
          style={{ padding: "0.75rem", fontSize: "1rem" }}
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="密码"
          autoComplete="current-password"
          required
          style={{ padding: "0.75rem", fontSize: "1rem" }}
        />
        {error && <p style={{ color: "#c0392b" }}>{error}</p>}
        <button
          type="submit"
          disabled={pending || !email.trim() || !password}
          style={{ padding: "0.85rem", fontSize: "1.05rem", fontWeight: 600 }}
        >
          {pending ? "登录中……" : "登录"}
        </button>
      </form>
    </main>
  );
}
