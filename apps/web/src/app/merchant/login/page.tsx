"use client";

import { FormEvent, useState } from "react";
import { merchantLogin } from "../../../lib/api";
import "../merchant.css";

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
    <main className="mc-center">
      <div className="mc-card">
        <h1 className="mc-title">商家核销登录</h1>
        <p className="mc-subtitle">登录后即可为顾客核销优惠券</p>
        <form className="mc-form" onSubmit={submit}>
          <label className="mc-field">
            <span className="mc-label">商家账号邮箱</span>
            <input
              className="mc-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              autoComplete="username"
              required
            />
          </label>
          <label className="mc-field">
            <span className="mc-label">密码</span>
            <input
              className="mc-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="mc-error">{error}</p>}
          <button
            className="mc-btn"
            type="submit"
            disabled={pending || !email.trim() || !password}
          >
            {pending ? "登录中……" : "登录"}
          </button>
        </form>
      </div>
    </main>
  );
}
