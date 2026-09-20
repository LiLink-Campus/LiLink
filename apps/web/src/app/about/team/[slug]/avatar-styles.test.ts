import { readFileSync } from "node:fs";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";

const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
});

it.each([373, 413, 640, 641, 900])(
  "keeps the founder avatar blended and the photo rounded at %ipx",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 908 } });
    try {
      // Load the actual stylesheet so media-query overrides participate in the cascade.
      await page.setContent(`<style>${css}</style>
        <header class="header">
          <img id="founder" class="avatar" alt="Founder avatar" />
          <img id="photo" class="avatar photo" alt="Member photo" />
        </header>`);
      const styles = await page.locator("img").evaluateAll((images) =>
        images.map((image) => {
          const style = getComputedStyle(image);
          return {
            blend: style.mixBlendMode,
            radius: style.borderRadius,
            fit: style.objectFit,
            background: style.backgroundColor,
          };
        }),
      );
      expect(styles[0]).toEqual({
        blend: "multiply",
        radius: "0px",
        fit: "contain",
        background: "rgba(0, 0, 0, 0)",
      });
      expect(styles[1]).toMatchObject({
        blend: "normal",
        radius: "50%",
        fit: "cover",
      });
    } finally {
      await page.close();
    }
  },
);
