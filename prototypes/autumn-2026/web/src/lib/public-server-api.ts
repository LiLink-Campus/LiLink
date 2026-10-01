import "server-only";

import { getServerApiBaseUrl } from "./api-base-url";
import type { EligibleSchoolsPayload } from "./eligible-schools";
import type { LandingPayload } from "./landing-payload";
import { VISUAL_PREVIEW } from "./visual-preview/mode";
import { previewResponse } from "./visual-preview/data";

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

export async function resolveApiOriginForPreconnect(): Promise<string | null> {
  if (VISUAL_PREVIEW) return null;
  try {
    return new URL(await getServerApiBaseUrl()).origin;
  } catch {
    return null;
  }
}

export async function getLandingPayload() {
  // Preserve the offline preview without consulting an existing API.
  if (VISUAL_PREVIEW) throw new Error("Landing statistics are unavailable in this visual preview.");
  const apiBaseUrl = await getServerApiBaseUrl();
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

export async function getEligibleSchools() {
  if (VISUAL_PREVIEW) return previewResponse("/public/schools") as EligibleSchoolsPayload;
  const apiBaseUrl = await getServerApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/public/schools`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 30 },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(parseFailedResponseBody(body, response.status));
  }

  return response.json() as Promise<EligibleSchoolsPayload>;
}
