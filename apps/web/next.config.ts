import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

if (process.env.NODE_ENV === "production" && !apiBaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_API_BASE_URL is required for production builds.",
  );
}

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: currentDirectory,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    cpus: 1,
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 100,
    staticGenerationRetryCount: 1,
    workerThreads: true,
  },
};

export default nextConfig;
