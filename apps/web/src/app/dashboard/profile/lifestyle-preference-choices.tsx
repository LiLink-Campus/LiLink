"use client";

import { useId } from "react";
import { ChoiceOption, QuestionChoices } from "./question-components";

export function LifestylePreferenceChoices({ value, options, onChange }: {
  value?: readonly string[];
  options: readonly string[];
  onChange: (value: string[]) => void;
}) {
  const hintId = useId();
  // Empty stored selections mean unrestricted; expand them only for display.
  const selected = value?.length ? value : options;
  function toggle(option: string) {
    const next = selected.includes(option)
      ? selected.filter(item => item !== option)
      : options.filter(item => item === option || selected.includes(item));
    if (!next.length) return;
    onChange(next.length === options.length ? [] : next);
  }
  return <>
    <p id={hintId}>可多选，至少保留一项；全选表示都能接受</p>
    <QuestionChoices layout="list">
      {options.map(option => {
        const checked = selected.includes(option);
        return <ChoiceOption key={option} data-minimum-selection={checked && selected.length === 1 || undefined}>
          <input type="checkbox" checked={checked} disabled={checked && selected.length === 1} aria-describedby={hintId} onChange={() => toggle(option)} />
          <span>{option}</span>
        </ChoiceOption>;
      })}
    </QuestionChoices>
  </>;
}
