export type AutosaveQueueItem<T> = {
  payload: T;
  snapshot: string;
};

export type AutosaveTimeoutController = {
  controller: AbortController;
  signal: AbortSignal;
  clear: () => void;
  hasTimedOut: () => boolean;
};

export function createAutosaveTimeoutController(
  timeoutMs: number,
): AutosaveTimeoutController {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Autosave timeout must be a positive finite number.");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    controller,
    signal: controller.signal,
    clear: () => {
      clearTimeout(timeoutId);
    },
    hasTimedOut: () => timedOut,
  };
}

export function takeNextAutosaveQueueItem<T>(
  queuedItem: AutosaveQueueItem<T> | null,
  options: {
    isUnmounted: boolean;
    lastSavedSnapshot: string;
  },
): AutosaveQueueItem<T> | null {
  if (!queuedItem || options.isUnmounted) {
    return null;
  }

  return queuedItem.snapshot === options.lastSavedSnapshot ? null : queuedItem;
}
