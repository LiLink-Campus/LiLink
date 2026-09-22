import { afterEach, describe, expect, it, vi } from "vitest";

import { initializeInstallCapture } from "./pwa-install-state";

function browser() {
  const target = new EventTarget() as EventTarget & {
    __lilinkInstallState?: { event: Event | null; installed: boolean; prompting: boolean };
  };
  vi.stubGlobal("window", target);
  return target;
}

afterEach(() => vi.unstubAllGlobals());

describe("early install capture", () => {
  it("retains eligibility before React mounts without opening a prompt", () => {
    const window = browser();
    initializeInstallCapture();
    const prompt = vi.fn();
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(window.__lilinkInstallState?.event).toBe(event);
    expect(prompt).not.toHaveBeenCalled();
    initializeInstallCapture();
    expect(window.__lilinkInstallState?.event).toBe(event);
  });

  it("clears a pending event on installation and ignores later eligibility", () => {
    const window = browser();
    initializeInstallCapture();
    window.dispatchEvent(new Event("appinstalled"));
    window.dispatchEvent(Object.assign(new Event("beforeinstallprompt"), { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: "accepted" }) }));
    expect(window.__lilinkInstallState).toMatchObject({ installed: true, event: null });
  });
});
