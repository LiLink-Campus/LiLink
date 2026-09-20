import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReferralLandingView } from "./landing-view";

describe("ReferralLandingView invalid invite fallback", () => {
  it("routes invalid invitation links to the registration chooser", () => {
    const html = renderToStaticMarkup(createElement(ReferralLandingView, { valid: false }));
    expect(html).toContain('href="/register"');
    expect(html).not.toContain('href="/register/personal"');
  });
});
