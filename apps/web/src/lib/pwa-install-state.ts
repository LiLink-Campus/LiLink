export type InstallEvent = Event & {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState = {
  event: InstallEvent | null;
  installed: boolean;
  prompting: boolean;
};

declare global {
  interface Window {
    __lilinkInstallState?: InstallState;
    __lilinkInstallCaptureReady?: boolean;
  }
}

export function getInstallState(): InstallState {
  return window.__lilinkInstallState ??= { event: null, installed: false, prompting: false };
}

export const INSTALL_READY_WAIT_MS = 2000;

// Called by client instrumentation before React hydrates.
export function initializeInstallCapture() {
  if (window.__lilinkInstallCaptureReady) return;
  window.__lilinkInstallCaptureReady = true;
  const state = getInstallState();
  window.addEventListener("beforeinstallprompt", (event) => {
    const installEvent = event as InstallEvent;
    if (typeof installEvent.prompt !== "function" || !installEvent.userChoice) return;
    event.preventDefault();
    if (!state.installed) state.event = installEvent;
  });
  window.addEventListener("appinstalled", () => {
    state.event = null;
    state.installed = true;
  });
}
