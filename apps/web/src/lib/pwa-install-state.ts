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

// Static first-party code executed before hydration, without an extra request.
export const INSTALL_CAPTURE_SCRIPT = `// Capture install eligibility before React hydrates, and retain it across routes.
(function () {
  if (window.__lilinkInstallCaptureReady) return;
  window.__lilinkInstallCaptureReady = true;
  var state = window.__lilinkInstallState || { event: null, installed: false, prompting: false };
  window.__lilinkInstallState = state;
  window.addEventListener("beforeinstallprompt", function (event) {
    if (typeof event.prompt !== "function" || !event.userChoice) return;
    event.preventDefault();
    if (!state.installed) state.event = event;
  });
  window.addEventListener("appinstalled", function () {
    state.event = null;
    state.installed = true;
  });
})();
`;
