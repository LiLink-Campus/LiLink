import { addIntegration, getReplay, replayIntegration } from "@sentry/nextjs";

// This module is reachable only through the deferred same-origin import.
export function installReplay() {
  addIntegration(replayIntegration());
}

export async function flushReplayForError() {
  const replay = getReplay();
  if (replay?.getRecordingMode()) await replay.flush();
}
