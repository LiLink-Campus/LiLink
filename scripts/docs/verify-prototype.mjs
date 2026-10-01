import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit, expect } from "@playwright/test";
import { verifyAssets } from "./assets.mjs";
import { createPrototypeRuntime } from "./prototype-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.join(root, "artifacts/docs-prototype-verification");
await mkdir(output, { recursive: true });
const assets = await verifyAssets(root);
if (!assets.passed) throw new Error("Prototype assets differ from the recorded migration source");
const results = [];
let runtime;
let serverNetwork;
let runFailure;
let interrupted = false;
const controller = new AbortController();
const interrupt = () => { interrupted = true; controller.abort(); void runtime?.stop(); };
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
try {
  runtime = await createPrototypeRuntime(root, output, controller.signal);
  const { base } = runtime;
  for (const [engine, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await browserType.launch({ headless: true });
    try {
      for (const [size, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
        if (interrupted) throw new Error("Prototype verification was interrupted.");
        const context = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "zh-CN" });
        const result = { engine, browserVersion: browser.version(), size, viewport, assertions: [], screenshots: [], blockedRequests: [], pageErrors: [] };
        results.push(result);
        await context.route("**/*", async (route) => {
          const request = new URL(route.request().url());
          if (request.origin !== base.origin) {
            result.blockedRequests.push({ origin: request.origin, method: route.request().method() });
            await route.abort();
          } else {
            await route.continue();
          }
        });
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        page.on("pageerror", (error) => result.pageErrors.push(error.message));
        async function capture(name) {
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
          expect(overflow, `${engine}/${size}/${name}: horizontal overflow`).toBe(false);
          result.assertions.push(`${name}: visible state and no horizontal overflow`);
          const filename = `${engine}-${size}-${name}.png`;
          const bytes = await page.screenshot({ path: path.join(output, filename), fullPage: true });
          result.screenshots.push({ filename, sha256: createHash("sha256").update(bytes).digest("hex") });
        }
        async function previewMenu() {
          await page.waitForLoadState("networkidle");
          const summary = page.locator("summary").filter({ hasText: "视觉预览" });
          await expect(summary).toBeVisible();
          if (!(await summary.locator("..").evaluate((details) => details.open))) {
            await summary.click();
          }
          await expect(page.getByLabel("匹配展示状态")).toBeVisible();
        }
        try {
          await page.goto(base.href, { waitUntil: "networkidle" });
          await expect(page.getByRole("heading", { name: /值得被认真对待/ })).toBeVisible();
          const announcement = page.getByRole("button", { name: "知道了", exact: true });
          if (await announcement.isVisible()) await announcement.click();
          await capture("home");

          await page.getByRole("link", { name: "立即加入", exact: true }).first().click();
          await expect(page.getByRole("heading", { name: "加入 LiLink", exact: true })).toBeVisible();
          await page.getByRole("link", { name: /学校邮箱\s+免邀请码/ }).click();
          await expect(page.getByRole("heading", { name: "验证学校邮箱", exact: true })).toBeVisible();
          await page.waitForLoadState("networkidle");
          await page.getByPlaceholder("name@school.edu.cn").fill("docs-probe@example.edu.cn");
          await page.getByRole("button", { name: "发送验证码", exact: true }).click();
          await expect(page.getByRole("status").filter({ hasText: "验证码已发送" })).toBeVisible();
          await page.getByRole("button", { name: "下一步", exact: true }).click();
          await expect(page.getByRole("heading", { name: "完善你的账号", exact: true })).toBeVisible();
          await page.locator('input[type="password"]').nth(0).fill("DocsPreview123");
          await page.locator('input[type="password"]').nth(1).fill("DocsPreview123");
          await page.getByRole("checkbox").check();
          await capture("registration");
          await page.getByRole("button", { name: "创建账号", exact: true }).click();
          await expect(page).toHaveURL(new URL("/dashboard", base).href);
          await expect(page.getByText("你好，林和", { exact: true })).toBeVisible();
          result.assertions.push("synthetic registration advances to fixture dashboard without a real account");

          await previewMenu();
          await page.getByRole("navigation", { name: "视觉预览页面" }).getByRole("link", { name: "登录", exact: true }).click();
          await expect(page.getByRole("heading", { name: "欢迎回来", exact: true })).toBeVisible();
          await page.waitForLoadState("networkidle");
          await page.getByPlaceholder("name@example.com").fill("docs-probe@example.edu.cn");
          await page.getByPlaceholder("输入你的密码").fill("DocsPreview123");
          await page.getByRole("button", { name: "登录", exact: true }).click();
          await expect(page).toHaveURL(new URL("/dashboard", base).href);
          await expect(page.getByText("你好，林和", { exact: true })).toBeVisible();
          result.assertions.push("synthetic login returns to fixture dashboard");

          for (const state of ["waitingNoResult", "matchedNotIntroduced", "introducedContactCompleted", "lastRoundUnmatched"]) {
            await previewMenu();
            await Promise.all([
              page.waitForEvent("framenavigated", { predicate: (frame) => frame === page.mainFrame() && new URL(frame.url()).pathname === "/dashboard/match" }),
              page.getByLabel("匹配展示状态").selectOption(state),
            ]);
            await page.waitForLoadState("networkidle");
            if (state === "waitingNoResult") {
              await expect(page.getByRole("heading", { name: "等待本轮揭晓", exact: true })).toBeVisible();
            } else if (state === "lastRoundUnmatched") {
              await expect(page.getByRole("heading", { name: "本轮未匹配到对象", exact: true })).toBeVisible();
            } else {
              const envelope = page.getByRole("button", { name: "打开来信，查看本轮匹配", exact: true });
              const name = page.getByText("陈一诺", { exact: true }).first();
              await expect.poll(async () => (await envelope.isVisible()) || (await name.isVisible())).toBe(true);
              if (await envelope.isVisible()) {
                await envelope.click();
                result.assertions.push("opening the envelope exposes the synthetic match result");
              }
              await expect(name).toBeVisible();
              await expect(page.getByRole("button", { name: "举报本次匹配", exact: true })).toBeVisible();
              if (state === "introducedContactCompleted") {
                await expect(page.getByText("chenyinuo_29", { exact: true })).toBeVisible();
              }
            }
            await capture(state);
          }
          const unexpectedRequests = result.blockedRequests.filter((request) =>
            request.origin !== "https://va.vercel-scripts.com" || request.method !== "GET",
          );
          expect(unexpectedRequests, "No attempted browser business requests").toEqual([]);
          const knownDateMismatch = (message) => engine === "webkit" &&
            message.startsWith("Hydration failed") && /\+\s+9月15日 周二 21:00/.test(message) && /-\s+9月15日周二 21:00/.test(message);
          result.knownWarnings = result.pageErrors.filter(knownDateMismatch).map(() => "Preserved prototype: WebKit and server Intl format Chinese weekday spacing differently; visible state recovers");
          expect(result.pageErrors.filter((message) => !knownDateMismatch(message)), "Unexpected page errors").toEqual([]);
          result.assertions.push("browser telemetry was blocked; no attempted browser business requests or unexpected page errors");
          result.passed = true;
        } catch (error) {
          result.passed = false;
          result.failure = error.message;
          await page.screenshot({ path: path.join(output, `${engine}-${size}-failure.png`), fullPage: true }).catch(() => {});
        } finally {
          await context.close();
        }
        console.log(JSON.stringify({ engine, size, passed: result.passed, assertions: result.assertions.length }));
      }
    } finally {
      await browser.close();
    }
  }
  serverNetwork = await runtime.networkEvidence();
  expect(serverNetwork.guardInstalled, "Server fetch guard must be installed").toBe(true);
  expect(serverNetwork.blockedRequests, "No attempted server-side network fetches").toEqual([]);
  if (interrupted) throw new Error("Prototype verification was interrupted.");
} catch (error) {
  runFailure = error.message;
  serverNetwork ??= await runtime?.networkEvidence();
} finally {
  await runtime?.stop();
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}
const report = {
  passed: !runFailure && results.length === 4 && results.every((result) => result.passed),
  environment: { node: process.version, baseURL: runtime?.base.origin, database: "none", browsers: "Isolated Playwright contexts", server: "Task-owned source copy and random loopback port; credential environment excluded" },
  prerequisites: "npm ci; npx playwright install chromium webkit; no pre-existing server required",
  data: "Existing development-only visual fixtures and disposable browser contexts; no live accounts, email or payments",
  scope: "Prototype relocation, registration/login previews, reveal interaction and four state selections; no live business validation",
  assets,
  serverNetwork,
  failure: runFailure,
  results,
};
await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
process.exitCode = report.passed ? 0 : 1;
