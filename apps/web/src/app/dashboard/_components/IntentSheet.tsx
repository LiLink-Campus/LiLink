"use client";

import { useEffect } from "react";
import {
  WEEKLY_INTENTS,
  WEEKLY_INTENT_LABELS,
  WEEKLY_INTENT_VISUALS,
  type WeeklyIntent,
} from "../../../lib/weekly-intent";

type IntentSheetProps = {
  open: boolean;
  saving: boolean;
  currentIntent: WeeklyIntent | null;
  onChoose: (intent: WeeklyIntent) => void;
  onClose: () => void;
};

/**
 * Bottom sheet shown when the user toggles "this week's participation"
 * on. Surfaces Friend / Date / Both as three large tap targets so the
 * intent choice happens in the same flow as opting in.
 */
export function IntentSheet({
  open,
  saving,
  currentIntent,
  onChoose,
  onClose,
}: IntentSheetProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, saving, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="intent-sheet-root" role="presentation">
      <button
        type="button"
        className="intent-sheet-backdrop"
        aria-label="关闭意图选择"
        disabled={saving}
        onClick={onClose}
      />
      <div
        className="intent-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intent-sheet-title"
      >
        <div className="intent-sheet-handle" aria-hidden="true" />
        <p className="eyebrow">本周匹配意图</p>
        <h2 id="intent-sheet-title">选一个本周想找的方向</h2>
        <p className="app-muted">
          BOTH 与所有意图相容；FRIEND 与 DATE 互斥。可在截止前再改一次。
        </p>
        <ul className="intent-sheet-options">
          {WEEKLY_INTENTS.map((intent) => {
            const meta = WEEKLY_INTENT_LABELS[intent];
            const visual = WEEKLY_INTENT_VISUALS[intent];
            const active = currentIntent === intent;
            return (
              <li key={intent}>
                <button
                  type="button"
                  className={
                    active
                      ? "intent-sheet-option is-active"
                      : "intent-sheet-option"
                  }
                  style={{ ["--intent-color" as string]: visual.accent }}
                  disabled={saving}
                  onClick={() => onChoose(intent)}
                >
                  <span
                    className="intent-sheet-option-glyph"
                    aria-hidden="true"
                  >
                    {visual.glyph}
                  </span>
                  <span className="intent-sheet-option-text">
                    <span className="intent-sheet-option-primary">
                      {meta.primary}
                    </span>
                    <span className="intent-sheet-option-subtitle">
                      {meta.subtitle}
                    </span>
                    <span className="intent-sheet-option-description">
                      {meta.description}
                    </span>
                  </span>
                  {active ? (
                    <span
                      className="intent-sheet-option-check"
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="button-secondary intent-sheet-cancel"
          disabled={saving}
          onClick={onClose}
        >
          取消
        </button>
      </div>
    </div>
  );
}
