import { type NextRequest } from "next/server";
import { proxy, config as proxyConfig } from "./proxy";

// Re-export the matcher so Next.js applies this middleware only to matched paths.
export const config = proxyConfig;

export function middleware(request: NextRequest) {
  return proxy(request);
}
