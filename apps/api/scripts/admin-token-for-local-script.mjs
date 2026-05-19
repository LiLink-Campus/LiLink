/**
 * Shared helpers for one-off localhost scripts hitting /v1/admin/*.
 */
import { randomUUID, createHmac } from "node:crypto";
import { loadPrismaClientModule } from "./prisma-client.mjs";

export function mintAdminJwtHs256(secret, payload) {
  const headerSegment = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payloadSegment = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const data = `${headerSegment}.${payloadSegment}`;
  const signature = createHmac("sha256", secret)
    .update(data)
    .digest("base64url");

  return `${data}.${signature}`;
}

export function extractCookieToken(setCookieHeader, cookieName) {
  if (!setCookieHeader) {
    return null;
  }

  const parts = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];

  const prefix = `${cookieName}=`;
  for (const part of parts) {
    const segment = typeof part === "string" ? part.split(",")[0].trim() : "";
    if (segment.startsWith(prefix)) {
      const value = segment.slice(prefix.length).split(";")[0];
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

async function tryMintDevAdminToken(secret) {
  if (process.env.APP_ENV !== "development") {
    return null;
  }

  let prisma;

  try {
    const { createPrismaClient } = await loadPrismaClientModule();
    prisma = createPrismaClient();
    const operator = await prisma.adminOperator.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true },
    });

    if (!operator) {
      return null;
    }

    const days = Number.parseInt(process.env.ADMIN_SESSION_TTL_DAYS || "14", 10);
    const ttlSeconds =
      Number.isFinite(days) && days > 0 ? days * 24 * 60 * 60 : 14 * 24 * 60 * 60;
    const nowSec = Math.floor(Date.now() / 1000);

    return mintAdminJwtHs256(secret, {
      sub: operator.id,
      email: operator.email,
      jti: randomUUID(),
      iat: nowSec,
      exp: nowSec + ttlSeconds,
    });
  } finally {
    await prisma?.$disconnect?.();
  }
}

/**
 * @returns {Promise<{ token: string; cookieName: string; baseUrl: string }>}
 */
export async function resolveAdminSessionForLocalScripts() {
  const baseUrl =
    process.env.API_BASE_URL?.replace(/\/+$/, "") || "http://127.0.0.1:4000/v1";
  const cookieName = process.env.ADMIN_COOKIE_NAME || "lilink_admin_token";
  const email = (
    process.env.ADMIN_FORCE_RUN_EMAIL?.trim().toLowerCase() ||
    process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase() ||
    ""
  )
    .trim()
    .toLowerCase();
  const password =
    process.env.ADMIN_FORCE_RUN_PASSWORD || process.env.ADMIN_BOOTSTRAP_PASSWORD || "";

  let token = null;
  let loginOk = false;

  if (email && password) {
    const loginRes = await fetch(`${baseUrl}/admin-session/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
    });

    loginOk = loginRes.ok;

    const rawCookies = loginRes.headers.getSetCookie?.() ?? null;
    const fallbackHeader = loginRes.headers.get("set-cookie");

    token = rawCookies?.length
      ? extractCookieToken(rawCookies, cookieName)
      : null;
    if (!token && fallbackHeader) {
      token = extractCookieToken(fallbackHeader, cookieName);
    }
  }

  if ((!token || !loginOk) && process.env.ADMIN_JWT_SECRET) {
    token =
      token && loginOk
        ? token
        : await tryMintDevAdminToken(process.env.ADMIN_JWT_SECRET);
    if (token && (!loginOk || !email || !password)) {
      console.error(
        !email || !password
          ? "No bootstrap credentials set; using APP_ENV=development JWT mint fallback."
          : "Admin login failed; using APP_ENV=development JWT mint fallback.",
      );
    }
  }

  if (!token) {
    throw new Error(
      "Could not authenticate admin: configure bootstrap credentials, or APP_ENV=development with ADMIN_JWT_SECRET plus an active AdminOperator.",
    );
  }

  return { token, cookieName, baseUrl };
}
