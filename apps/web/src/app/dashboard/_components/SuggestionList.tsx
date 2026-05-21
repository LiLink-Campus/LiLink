import Link from "next/link";
import type { ComponentType } from "react";
import { ArrowRightIcon, ClipboardIcon, ProfileIcon } from "./icons";
import type { Suggestion, SuggestionIconKey } from "../_lib/suggestions";

const ICONS: Record<SuggestionIconKey, ComponentType<{ className?: string }>> = {
  clipboard: ClipboardIcon,
  profile: ProfileIcon,
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

/**
 * The "建议你做 / Suggested" checklist shown beneath the primary DO NOW card.
 * Each row carries a status circle (display-only), an icon, copy, an optional
 * progress bar, and a single navigation action. Renders nothing when empty.
 */
export function SuggestionList({ suggestions }: { suggestions: Suggestion[] }) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <section className="v2-suggest" aria-label="建议你做">
      <header className="v2-suggest-head">
        <span className="v2-suggest-eyebrow">建议你做 · Suggested</span>
        <span className="v2-suggest-count">{suggestions.length} 项</span>
      </header>
      <ul className="v2-suggest-list">
        {suggestions.map((suggestion) => {
          const Icon = ICONS[suggestion.icon];
          return (
            <li key={suggestion.id} className="v2-suggest-row">
              <span className="v2-suggest-check" aria-hidden="true" />
              <span className="v2-suggest-icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="v2-suggest-main">
                <p className="v2-suggest-title">{suggestion.title}</p>
                <p className="v2-suggest-sub">{suggestion.body}</p>
                {typeof suggestion.progressPercent === "number" ? (
                  <div className="v2-suggest-progress">
                    <div className="v2-suggest-progress-bar">
                      <div
                        style={{
                          width: `${clampPercent(suggestion.progressPercent)}%`,
                        }}
                      />
                    </div>
                    <span className="v2-suggest-progress-val">
                      {suggestion.progressPercent}%
                    </span>
                  </div>
                ) : null}
              </div>
              <Link href={suggestion.action.href} className="v2-suggest-action">
                {suggestion.action.label}
                <ArrowRightIcon />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
