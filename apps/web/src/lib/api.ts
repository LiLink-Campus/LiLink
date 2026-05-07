import { apiBaseUrl } from "./api-base-url";
import type { SupportedLocale } from "@lilink/shared";
import { readClientLocale } from "./i18n";

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
  "Submit a complete questionnaire before opting into matching.":
    "请先完成「资料」中的问卷，再参加本轮匹配。",
  "Your questionnaire is missing required fields. Please update your profile before opting into matching.":
    "你的问卷有必填项缺失，请回到「资料」补全后再参加本轮匹配。",
  "Your questionnaire has unsaved incomplete changes. Please finish or discard the draft before opting in.":
    "问卷有未保存的修改且必填项缺失，请回到「资料」补完或撤销修改后再参加本轮匹配。",
};

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

function userFacingApiMessage(raw: string, locale: SupportedLocale): string {
  const trimmed = raw.trim();
  if (locale === "en-US") {
    return trimmed;
  }
  return API_ERROR_EN_TO_ZH[trimmed] ?? trimmed;
}

function parseFailedResponseBody(
  text: string,
  status: number,
  locale: SupportedLocale,
): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return locale === "en-US"
      ? `Request failed (${status})`
      : `请求失败（${status}）`;
  }
  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown };
    if (typeof parsed.message === "string") {
      return userFacingApiMessage(parsed.message, locale);
    }
    if (Array.isArray(parsed.message)) {
      const parts = parsed.message.filter(
        (item): item is string => typeof item === "string",
      );
      if (parts.length > 0) {
        return parts
          .map((part) => userFacingApiMessage(part, locale))
          .join(locale === "en-US" ? "; " : "；");
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
  const locale = readClientLocale();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-locale": locale,
      ...(init?.headers ?? {}),
    },
    credentials: "include",
    cache: init?.cache ?? "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiRequestError(
      parseFailedResponseBody(body, response.status, locale),
      response.status,
    );
  }

  const text = await response.text();
  if (!text) return null as unknown as T;
  return JSON.parse(text) as T;
}

export type AuthMePayload = {
  id: string;
  email: string;
  displayName: string | null;
  preferredLocale: SupportedLocale;
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
