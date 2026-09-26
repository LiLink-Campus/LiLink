// Metadata only: never retain questionnaire data outside the mounted page.
let accountId: string | null = null;
let revision = 0;
let session = 0;
const pending = new Map<symbol, symbol>();
type WriteEvent = { owner: symbol; settled: boolean };
const listeners = new Set<(event: WriteEvent) => void>();

export function setProfileReadAccount(userId: string | null) {
  if (accountId === userId) return;
  accountId = userId;
  revision = 0;
  session += 1;
  pending.clear();
}

export function beginProfileWrite(userId: string, owner: symbol) {
  const scope = session;
  const id = Symbol("profile-write");
  let changed = false;
  if (accountId === userId) pending.set(id, owner);
  return {
    succeeded() {
      if (accountId !== userId || scope !== session) return;
      changed = true;
      revision += 1;
      listeners.forEach(listener => listener({ owner, settled: false }));
    },
    finish() {
      if (accountId !== userId || scope !== session || !pending.delete(id)) return;
      // A failed response may still have committed: only a fresh read can tell.
      if (!changed) revision += 1;
      listeners.forEach(listener => listener({ owner, settled: true }));
    },
  };
}

export function subscribeProfileWrites(listener: (event: WriteEvent) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function hasOtherProfileWrites(userId: string, owner: symbol) {
  return accountId === userId && [...pending.values()].some(source => source !== owner);
}

export function profileReadRevision(userId: string) {
  return accountId === userId ? revision : 0;
}

export function isProfileReadAccount(userId: string) {
  return accountId === userId;
}
