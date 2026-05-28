import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { resolveConfiguredLanApiHostname } from "./src/lib/api-base-url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const workspaceRoot = path.resolve(currentDirectory, "../..");

function resolveAllowedDevOrigins(): string[] {
  const hostname = resolveConfiguredLanApiHostname();
  return hostname ? [hostname] : [];
}

export default function createNextConfig(phase: string): NextConfig {
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
    allowedDevOrigins: resolveAllowedDevOrigins(),
    transpilePackages: ["@lilink/shared"],
    turbopack: {
      root: workspaceRoot,
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
