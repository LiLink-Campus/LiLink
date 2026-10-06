import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { legacyImageRedirects } from "../../scripts/images/legacy-public-paths.mjs";
import { immutablePublicAssetHeaders } from "../../scripts/images/immutable-headers.mjs";
import { resolveConfiguredLanApiHostname } from "./src/lib/api-base-url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const workspaceRoot = path.resolve(currentDirectory, "../..");

function resolveAllowedDevOrigins(): string[] {
  const hostname = resolveConfiguredLanApiHostname();
  return hostname ? [hostname] : [];
}

function createNextConfig(phase: string): NextConfig {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const useBuildTsconfig =
    phase === PHASE_PRODUCTION_BUILD ||
    process.env.LILINK_NEXT_TSCONFIG === "build";

  if (phase === PHASE_PRODUCTION_BUILD && !apiBaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is required for production builds.",
    );
  }

  return {
    output: "standalone",
    images: {
      qualities: [60, 75],
    },
    async redirects() {
      return legacyImageRedirects;
    },
    async headers() {
      return [{
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }],
      }, ...await immutablePublicAssetHeaders(path.join(currentDirectory, "public"))];
    },
    allowedDevOrigins: resolveAllowedDevOrigins(),
    transpilePackages: ["@lilink/shared"],
    turbopack: {
      root: process.env.LILINK_BUILD_WORKSPACE_ROOT || workspaceRoot,
    },
    typescript: {
      ignoreBuildErrors: false,
      tsconfigPath: useBuildTsconfig
        ? "tsconfig.build.json"
        : "tsconfig.json",
    },
    experimental: {
      workerThreads: true,
    },
  };
}

const sentryNextConfig = withSentryConfig(createNextConfig, {
  org: "sed-i",
  project: "lilink",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
});

export default function nextConfig(phase: string): NextConfig {
  const config = sentryNextConfig(phase);
  // Sentry injects these globally. Cached HTML must not carry a regeneration's
  // random trace; existing dynamic routes explicitly export request metadata.
  config.experimental = {
    ...config.experimental,
    clientTraceMetadata: config.experimental?.clientTraceMetadata?.filter(
      (name) => name !== "sentry-trace" && name !== "baggage",
    ),
  };
  return config;
}
