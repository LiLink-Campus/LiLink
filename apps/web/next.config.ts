import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const workspaceRoot = path.resolve(currentDirectory, "../..");
export default function createNextConfig(phase: string): NextConfig {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (phase === PHASE_PRODUCTION_BUILD && !apiBaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is required for production builds.",
    );
  }

  return {
    output: "standalone",
    transpilePackages: ["@lilink/shared"],
    turbopack: {
      root: workspaceRoot,
    },
    typescript: {
      ignoreBuildErrors: false,
    },
    experimental: {
      workerThreads: true,
    },
  };
}
