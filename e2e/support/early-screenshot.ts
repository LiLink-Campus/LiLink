import type { Page } from '@playwright/test';

/** Capture the actual pending frame; WebKit fonts.ready can await held resources. */
export async function earlyScreenshot(page: Page) {
  const previous = process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
  process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
  try {
    return await page.screenshot();
  } finally {
    if (previous === undefined) delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
    else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = previous;
  }
}
