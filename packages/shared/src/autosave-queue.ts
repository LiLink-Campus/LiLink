export type AutosaveQueueItem<T> = {
  payload: T;
  snapshot: string;
};

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
