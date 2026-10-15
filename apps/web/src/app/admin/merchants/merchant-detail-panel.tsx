"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { fetchApi } from "../../../lib/api";
import type { AdminMerchant, AdminMerchantUser } from "../types";
import styles from "./merchants.module.css";

export function MerchantDetailPanel({
  merchant,
  onChanged,
}: {
  merchant: AdminMerchant;
  onChanged: () => void;
}) {
  const [users, setUsers] = useState<AdminMerchantUser[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadUsers = useCallback(
    async (signal?: AbortSignal) => {
      setLoadError(null);
      try {
        const result = await fetchApi<{ items: AdminMerchantUser[] }>(
          `/admin/merchants/${merchant.id}/users`,
          { signal }
        );
        if (!signal?.aborted) setUsers(result.items);
      } catch (caught) {
        if (!signal?.aborted)
          setLoadError(caught instanceof Error ? caught.message : "加载账号失败。");
      }
    },
    [merchant.id]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadUsers(controller.signal);
    return () => controller.abort();
  }, [loadUsers]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending("create");
    setError(null);
    try {
      await fetchApi(`/admin/merchants/${merchant.id}/users`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setEmail("");
      setPassword("");
      setAdding(false);
      await loadUsers();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建账号失败。");
    } finally {
      setPending(null);
    }
  }

  async function toggleUser(user: AdminMerchantUser) {
    if (pending) return;
    setPending(user.id);
    setError(null);
    try {
      await fetchApi(`/admin/merchant-users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      await loadUsers();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败。");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.accounts}>
      <div className={styles.accountToolbar}>
        <h3>核销账号</h3>
        <button
          type="button"
          className={styles.textAction}
          aria-expanded={adding}
          aria-label={adding ? "取消添加" : "添加账号"}
          disabled={pending !== null}
          onClick={() => {
            setAdding(!adding);
            setPassword("");
            setError(null);
          }}
        >
          {adding ? "取消添加" : "＋ 添加账号"}
        </button>
      </div>
      {error && (
        <p role="alert" className="ui-form-message ui-form-message--error">
          {error}
        </p>
      )}
      {loadError && (
        <div role="alert">
          <p>{loadError}</p>
          <button type="button" className={styles.textAction} onClick={() => void loadUsers()}>
            重试加载账号
          </button>
        </div>
      )}
      {users === null ? (
        !loadError && <p role="status">加载账号中…</p>
      ) : users.length === 0 ? (
        <p className={styles.empty}>暂无核销账号。</p>
      ) : (
        <table className={styles.accountTable}>
          <thead>
            <tr>
              <th scope="col">账号</th>
              <th scope="col">状态</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>
                  <span className={styles.accountStatus} data-active={user.isActive}>
                    {user.isActive ? "启用中" : "已停用"}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.textAction}
                    disabled={pending !== null}
                    onClick={() => void toggleUser(user)}
                  >
                    {pending === user.id ? "处理中…" : user.isActive ? "停用" : "启用"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && (
        <section aria-label="新增核销账号">
          <form className={styles.accountForm} onSubmit={createUser}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="账号邮箱"
              aria-label="账号邮箱"
              autoComplete="off"
              maxLength={254}
              required
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="初始密码（≥8 位）"
              aria-label="初始密码"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
            <button
              className="ui-button ui-button--primary"
              type="submit"
              disabled={pending !== null || !email.trim() || password.length < 8}
            >
              {pending === "create" ? "创建中…" : "新增账号"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
