"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Field, FormMessage, Input } from "@/components/ui";
import { merchantLogin } from "../../../lib/api";
import styles from "../merchant.module.css";

/**
 * Only allow known same-site prefixes as post-login redirect targets.
 * Rejects open-redirect vectors including backslash-based bypasses
 * (e.g. /\evil.com, /%5Cevil.com) that some browsers resolve externally.
 */
function isSafeSameSitePath(value: string): boolean {
  // Block raw and percent-encoded backslashes before any other check.
  if (/[\\]|%5[Cc]/i.test(value)) return false;
  // Allowlist: only paths the merchant portal legitimately redirects to.
  return value.startsWith("/r/") || value.startsWith("/merchant/");
}

/**
 * Inner form component that reads useSearchParams — must be wrapped in
 * <Suspense> to satisfy Next.js static pre-rendering requirements.
 */
function MerchantLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get("next");
    setNextPath(raw && isSafeSameSitePath(raw) ? raw : null);
  }, [searchParams]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await merchantLogin(email.trim(), password);
      router.push(nextPath ?? "/merchant/redeem");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败，请重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <Field label="商家账号邮箱">
        <Input
          border="subtle"
          controlSize="lg"
          radius="sm"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          autoComplete="username"
          required
        />
      </Field>
      <Field label="密码">
        <Input
          border="subtle"
          controlSize="lg"
          radius="sm"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="请输入密码"
          autoComplete="current-password"
          required
        />
      </Field>
      {error && <FormMessage>{error}</FormMessage>}
      <Button
        block
        elevation="flat"
        shape="rounded"
        size="lg"
        type="submit"
        disabled={pending || !email.trim() || !password}
      >
        {pending ? "登录中……" : "登录"}
      </Button>
    </form>
  );
}

export default function MerchantLoginPage() {
  return (
    <main className={styles.center}>
      <Card
        as="div"
        className={styles.loginCard}
        elevation="md"
        layout="plain"
        padding="spacious"
      >
        <h1 className={styles.title}>商家核销登录</h1>
        <p className={styles.subtitle}>登录后即可为顾客核销优惠券</p>
        <Suspense>
          <MerchantLoginForm />
        </Suspense>
      </Card>
    </main>
  );
}
