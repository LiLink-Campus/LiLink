import "server-only";

import { unstable_cache } from "next/cache";
import { getServerApiBaseUrl } from "./api-base-url";

class PublicDataError extends Error {
  constructor(readonly reason: string, readonly retryable: boolean) {
    super(`Public data unavailable: ${reason}`);
  }
}

async function loadPublicData(base: string, path: PublicDataPath): Promise<unknown> {
  const startedAt = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    let phase: "connection" | "response" = "connection";
    let status: number | null = null;
    let upstreamRay: string | null = null;
    try {
      const response = await fetch(`${base}${path}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      phase = "response";
      status = response.status;
      const ray = response.headers.get("cf-ray");
      upstreamRay = ray && /^[a-f0-9]+-[A-Z]{3}$/.test(ray) ? ray : null;
      if (!response.ok) {
        throw new PublicDataError(`HTTP ${response.status}`, response.status >= 500);
      }
      return await response.json();
    } catch (error) {
      const retryable = controller.signal.aborted || error instanceof TypeError
        || (error instanceof PublicDataError && error.retryable);
      if (attempt === 0 && retryable) continue;
      const reason = controller.signal.aborted ? "timeout"
        : error instanceof PublicDataError ? error.reason : "network or invalid response";
      const cause = error instanceof Error ? error.cause : null;
      const code = cause && typeof cause === "object" && "code" in cause ? cause.code : null;
      console.warn(`[public-data] ${path}: ${reason}`, {
        phase, status, upstreamRay, attempt: attempt + 1, elapsedMs: Date.now() - startedAt,
        causeCode: typeof code === "string" && /^[A-Z0-9_]{1,64}$/.test(code) ? code : null,
      });
      // Throw instead of caching a failure; Next retains the last successful value.
      throw new PublicDataError(reason, false);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new PublicDataError("retry exhausted", false);
}

type PublicDataPath = "/public/community" | "/public/landing" | "/public/schools";
const refreshSeconds: Record<PublicDataPath, number> = {
  "/public/community": 30,
  "/public/landing": 60,
  "/public/schools": 60,
};

export async function getCachedPublicData<T>(path: PublicDataPath): Promise<T> {
  // Only allowlisted anonymous data belongs in this shared cache.
  const cached = unstable_cache(loadPublicData, ["public-data-v1"], {
    revalidate: refreshSeconds[path],
  });
  // Resolve request-dependent development configuration outside the cache scope.
  return await cached(await getServerApiBaseUrl(), path) as T;
}
