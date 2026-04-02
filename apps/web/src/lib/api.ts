const DEFAULT_API_BASE_URL = "http://localhost:4000/v1";

export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

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
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
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
  try {
    return await fetchApi<LandingPayload>("/public/landing");
  } catch {
    return {
      brand: "LiLink",
      tagline: "在黎安，遇见真正同频的人。",
      stats: {
        registeredUsers: 0,
        completedQuestionnaires: 0,
        matchesDelivered: 0,
      },
      currentCycle: null,
    } satisfies LandingPayload;
  }
}

