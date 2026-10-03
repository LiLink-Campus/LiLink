import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { getServerApiBaseUrl } from "../../../../../lib/api-base-url";
import { fetchServerApi } from "../../../../../lib/server-api-transport";

export const runtime = "nodejs";

function reply(status: number, invalidated = false, retryAfterSeconds?: number) {
  return Response.json({ ok: status === 200, invalidated }, { status, headers: {
    "Cache-Control": "no-store", ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
  } });
}

export async function POST(request: Request) {
  const secret = process.env.PUBLIC_CACHE_REVALIDATION_SECRET;
  if (!secret || secret.length < 32) return reply(503);
  const timestamp = request.headers.get("x-lilink-timestamp") ?? "";
  const signature = request.headers.get("x-lilink-signature") ?? "";
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)
    || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return reply(401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(400);
  const reader = request.body?.getReader();
  if (!reader) return reply(400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Request body deadline exceeded")), 3000);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      length += value.byteLength;
      if (length > 1024) { await reader.cancel(); return reply(413); }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return reply(401);
    const payload: unknown = JSON.parse(body.toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return reply(400);
    const { scope, revision } = payload as Record<string, unknown>;
    if ((scope !== "home" && scope !== "schools") || typeof revision !== "string"
      || !/^[1-9]\d{0,18}$/.test(revision) || BigInt(revision) > BigInt("9223372036854775807")
      || Object.keys(payload).length !== 2) return reply(400);
    const canonical = JSON.stringify({ scope, revision });
    const claimTimestamp = Math.floor(Date.now() / 1000).toString();
    const claimSignature = createHmac("sha256", secret).update(`${claimTimestamp}.${canonical}`).digest("hex");
    let claim: unknown;
    try {
      const response = await fetchServerApi(`${await getServerApiBaseUrl()}/internal/public-cache/claim`, {
        method: "POST", cache: "no-store", redirect: "error", credentials: "omit",
        headers: { "content-type": "application/json", "x-lilink-timestamp": claimTimestamp,
          "x-lilink-signature": claimSignature },
        body: canonical, signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) { await response.body?.cancel(); return reply(503); }
      claim = await response.json();
    } catch { return reply(503); }
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return reply(503);
    const { decision, retryAfterSeconds } = claim as Record<string, unknown>;
    if (decision === "duplicate") return reply(200);
    if (decision === "deferred" && typeof retryAfterSeconds === "number" && Number.isInteger(retryAfterSeconds)
      && retryAfterSeconds >= 1 && retryAfterSeconds <= 1800) {
      return reply(429, false, retryAfterSeconds);
    }
    if (decision !== "invalidate") return reply(503);
    // Scope allowlisting prevents invalidating arbitrary routes or private data.
    revalidateTag(scope === "home" ? "public-home" : "public-schools", "max");
    return reply(200, true);
  } catch {
    await reader.cancel().catch(() => {});
    return reply(400);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
