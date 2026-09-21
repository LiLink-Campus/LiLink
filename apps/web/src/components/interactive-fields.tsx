"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function InteractiveFields({ children }: { children: ReactNode }) {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);

  // SSR controls must not accept input before React can record their changes.
  return (
    <fieldset disabled={!ready} aria-busy={!ready} style={{ display: "contents" }}>
      {children}
    </fieldset>
  );
}
