import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const landingClientSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "landing-client.tsx"),
  "utf8",
);

describe("ReferralLandingClient invalid invite fallback", () => {
  it("routes invalid invitation links to the registration chooser", () => {
    const invalidStateBlock = landingClientSource.match(
      /valid === false \? \([\s\S]*?\) : valid === true \?/,
    )?.[0];

    expect(invalidStateBlock).toContain('href="/register"');
    expect(invalidStateBlock).not.toContain('href="/register/personal"');
  });
});
