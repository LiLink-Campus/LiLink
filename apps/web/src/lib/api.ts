import { apiBaseUrl } from "./api-base-url";

const API_ERROR_EN_TO_ZH: Record<string, string> = {
  "This email domain is not currently accepted.":
    "该邮箱后缀不在平台当前支持的学校列表中。请使用学校在后台登记的学校邮箱域名（常见为 .edu.cn 等官方后缀）。若不确定，可向学校 IT 或平台管理员确认。",
  "No valid verification code was found.":
    "未找到有效验证码，请先返回上一步重新获取验证码。",
  "Verification code is invalid. Please request a new one.":
    "验证码不正确或已失效，请重新获取验证码。",
  "This email is already registered.":
    "该邮箱已注册，请直接登录。",
  "Email or password is incorrect.":
    "邮箱或密码不正确。",
  "Account has been suspended.":
    "账号已被暂停使用。",
  "Account is not active yet.":
    "账号尚未激活。",
  "Verification email could not be delivered. Please try again later.":
    "验证邮件发送失败，请稍后再试。",
  "User account no longer exists.":
    "账号不存在。",
};

function userFacingApiMessage(raw: string): string {
  const trimmed = raw.trim();
  return API_ERROR_EN_TO_ZH[trimmed] ?? trimmed;
}

function parseFailedResponseBody(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return `请求失败（${status}）`;
  }
  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown };
    if (typeof parsed.message === "string") {
      return userFacingApiMessage(parsed.message);
    }
    if (Array.isArray(parsed.message)) {
      const parts = parsed.message.filter(
        (item): item is string => typeof item === "string",
      );
      if (parts.length > 0) {
        return parts.map(userFacingApiMessage).join("；");
      }
    }
  } catch {
    // Response is not JSON; show body as-is (e.g. proxy HTML).
  }
  return trimmed;
}

export async function fetchApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
    cache: init?.cache ?? "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(parseFailedResponseBody(body, response.status));
  }

  const text = await response.text();
  if (!text) return null as unknown as T;
  return JSON.parse(text) as T;
}

export type AuthMePayload = {
  id: string;
  email: string;
  displayName: string | null;
};

let authMeInflight: Promise<AuthMePayload | null> | null = null;

/**
 * Coalesces overlapping GET /auth/me calls (e.g. SiteNav + Dashboard on first paint).
 * Clears after settle so a later navigation still refetches fresh session state.
 */
export function fetchAuthMeDeduped(): Promise<AuthMePayload | null> {
  if (!authMeInflight) {
    authMeInflight = fetchApi<AuthMePayload>("/auth/me")
      .catch(() => null)
      .finally(() => {
        authMeInflight = null;
      });
  }
  return authMeInflight;
}
