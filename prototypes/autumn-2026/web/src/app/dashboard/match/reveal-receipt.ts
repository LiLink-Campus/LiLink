const seenInMemory = new Set<string>();
const prefix = "lilink:match-reveal:v1:";

export function hasSeenReveal(key: string): boolean {
  if (seenInMemory.has(key)) return true;
  try { return window.localStorage.getItem(prefix + key) === "seen"; }
  catch { return false; }
}

export function markRevealSeen(key: string): void {
  seenInMemory.add(key);
  try { window.localStorage.setItem(prefix + key, "seen"); }
  catch { /* Retain an in-memory receipt when storage is unavailable. */ }
}
