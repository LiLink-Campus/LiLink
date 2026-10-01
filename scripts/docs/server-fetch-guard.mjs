import { appendFileSync } from "node:fs";

const log = process.env.LILINK_DOCS_SERVER_FETCH_LOG;
if (!log) throw new Error("The prototype fetch guard requires its task-owned log.");
appendFileSync(log, JSON.stringify({ event: "installed", pid: process.pid }) + "\n");
globalThis.fetch = async (input, init) => {
  let url;
  try { url = new URL(typeof input === "string" || input instanceof URL ? input : input.url); } catch {}
  const method = init?.method ?? input?.method ?? "GET";
  const frameworkCheck = method === "GET" && url?.href === "https://registry.npmjs.org/-/package/next/dist-tags";
  appendFileSync(log, JSON.stringify({
    event: frameworkCheck ? "blocked-framework-check" : "blocked-fetch", method: /^[A-Z]+$/.test(method) ? method : "unknown",
    destination: url && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ? "loopback" : "external",
    path: url && /^\/v1\/public\/(landing|schools)$/.test(url.pathname) ? url.pathname : "[redacted]",
  }) + "\n");
  throw new Error("Prototype verification blocked a server-side network fetch.");
};
