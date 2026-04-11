import "server-only";

import { apiBaseUrl } from "./api-base-url";

type LandingPayload = {
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

function parseFailedResponseBody(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return `请求失败（${status}）`;
  }

  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown };
    if (typeof parsed.message === "string") {
      return parsed.message;
    }
    if (Array.isArray(parsed.message)) {
      const parts = parsed.message.filter(
        (item): item is string => typeof item === "string",
      );
      if (parts.length > 0) {
        return parts.join("；");
      }
    }
  } catch {
    // Response is not JSON; show body as-is.
  }

  return trimmed;
}

export function resolveApiOriginForPreconnect(): string | null {
  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    return null;
  }
}

export async function getLandingPayload() {
  const response = await fetch(`${apiBaseUrl}/public/landing`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(parseFailedResponseBody(body, response.status));
  }

  return response.json() as Promise<LandingPayload>;
}

export type { LandingPayload };
