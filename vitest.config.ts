import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        resolve: {
          dedupe: ["path-to-regexp"],
        },
        optimizeDeps: {
          include: ["path-to-regexp", "msw", "msw-storybook-addon"],
        },
        plugins: [
          storybookTest({
            configDir: path.join(dirname, "apps/web/.storybook"),
            storybookScript: "npm run storybook:web -- --ci --no-open",
            tags: {
              include: ["smoke"],
              exclude: [],
              skip: [],
            },
          }),
        ],
        test: {
          name: "storybook",
          dir: dirname,
          browser: {
            enabled: true,
            provider: playwright({}),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
