export type AutosaveQueueItem<T> = {
  payload: T;
  snapshot: string;
};

export type AutosaveLifecycleGate = {
  markMounted: () => number;
  markUnmounted: () => number;
  isUnmounted: () => boolean;
  currentToken: () => number;
  isTokenActive: (token: number) => boolean;
};

export type AutosaveTimeoutController = {
  controller: AbortController;
  signal: AbortSignal;
  clear: () => void;
  hasTimedOut: () => boolean;
};

export function createAutosaveLifecycleGate(): AutosaveLifecycleGate {
  let unmounted = false;
  let token = 0;

  return {
    markMounted: () => {
      unmounted = false;
      token += 1;
      return token;
    },
    markUnmounted: () => {
      unmounted = true;
      token += 1;
      return token;
    },
    isUnmounted: () => unmounted,
    currentToken: () => token,
    isTokenActive: (candidateToken: number) =>
      !unmounted && candidateToken === token,
  };
}

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
