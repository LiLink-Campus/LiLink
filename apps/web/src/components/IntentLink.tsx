"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/** Allow Next to prefetch only after pointer, keyboard, or touch intent. */
export function IntentLink({ onMouseEnter, onFocus, onTouchStart, ...props }: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [intent, setIntent] = useState(false);
  return <Link {...props} prefetch={intent ? null : false}
    onMouseEnter={event => { setIntent(true); onMouseEnter?.(event); }}
    onFocus={event => { setIntent(true); onFocus?.(event); }}
    onTouchStart={event => { setIntent(true); onTouchStart?.(event); }}
  />;
}
