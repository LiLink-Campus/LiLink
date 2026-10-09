import { defineConfig } from "vitest/config";

// Node-environment unit tests for pure web logic (no DOM/React/Next needed).
// Storybook browser tests live in the repo-root vitest.config.ts instead.
export default defineConfig({
  test: {
    allowOnly: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
