const DEFAULT_API_BASE_URL = "http://localhost:4000/v1";

export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

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
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(parseFailedResponseBody(body, response.status));
  }

  return response.json() as Promise<T>;
}

export type LandingPayload = {
  brand: string;
  tagline: string;
  stats: {
    registeredUsers: number;
    completedQuestionnaires: number;
    matchesDelivered: number;
  };
  currentCycle: {
    codename: string;
    revealAt: string;
    participationDeadline: string;
  } | null;
};

export async function getLandingPayload() {
  return fetchApi<LandingPayload>("/public/landing");
}
