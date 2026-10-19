import { sentryEnabled } from "./sentry-config";

let loading: Promise<typeof import("./replay-integration") | undefined> | undefined;
let replayReady = false;
let earlyErrorRecordingRequested = false;

function loadReplay() {
  if (!sentryEnabled) return Promise.resolve(undefined);
  // One import attempt per document, including concurrent errors.
  return loading ??= import("./replay-integration").then(replayModule => {
    replayModule.installReplay();
    replayReady = true;
    return replayModule;
  }).catch(() => {
    console.warn("Session Replay could not load; core error reporting remains active.");
    return undefined;
  });
}

export function loadReplayForError() {
  if (!sentryEnabled || replayReady || earlyErrorRecordingRequested) return;
  earlyErrorRecordingRequested = true;
  // Core errors continue immediately; an early recording is best effort.
  void loadReplay().then(replayModule => replayModule?.flushReplayForError()).catch(() => {
    console.warn("Session Replay could not flush; core error reporting remains active.");
  });
}

export function scheduleReplay() {
  if (!sentryEnabled) return;
  const afterLoad = () => window.setTimeout(() => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(() => { void loadReplay(); }, { timeout: 5000 });
    else void loadReplay();
  }, 2000);
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
}
