"use client";

export type ValuePickerOption = {
  value: string;
  label: string;
};

type ValuePickerProps = {
  id?: string;
  name?: string;
  value: string;
  options: ValuePickerOption[];
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Display suffix shown after the chosen label (e.g. "cm", "岁"). */
  suffix?: string;
  /**
   * Heading used as the picker's accessible name when no explicit
   * `ariaLabel` is provided. Kept around so existing call sites stay
   * source-compatible after consolidating onto the native control.
   */
  sheetTitle?: string;
};

/**
 * Value picker that always delegates to the browser's native `<select>`.
 *
 * The visible "trigger" is a styled `<div>` that mirrors our dashboard
 * chrome; a fully transparent `<select>` is layered on top to capture
 * the actual user interaction. We intentionally avoid a custom
 * popover/bottom-sheet because the previous implementation lost clicks
 * to a competing scroll effect on long option lists, while only the
 * 12-item month picker stayed reliable. Routing every device through
 * the OS-native control sidesteps that race entirely.
 */
export function ValuePicker({
  id,
  name,
  value,
  options,
  onChange,
  placeholder = "请选择",
  disabled = false,
  ariaLabel,
  suffix,
  sheetTitle,
}: ValuePickerProps) {
  const selectedOption =
    options.find((option) => option.value === value) ?? null;
  const triggerLabel = selectedOption
    ? suffix
      ? `${selectedOption.label} ${suffix}`
      : selectedOption.label
    : placeholder;
  const isPlaceholder = !selectedOption;
  const accessibleName = ariaLabel ?? sheetTitle ?? placeholder;
  const hasPlaceholderOption = options.some((option) => option.value === "");
  const displayClassName = `picker-trigger picker-native-display${
    isPlaceholder ? " is-placeholder" : ""
  }${disabled ? " is-disabled" : ""}`;

  return (
    <div className="picker-root">
      <div className="picker-native-wrap">
        <div className={displayClassName} aria-hidden="true">
          <span className="picker-trigger-text">{triggerLabel}</span>
          <span className="picker-native-caret" aria-hidden="true">
            ▾
          </span>
        </div>
        <select
          id={id}
          name={name}
          className="picker-native-select"
          value={value}
          aria-label={accessibleName}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {!hasPlaceholderOption ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {suffix ? `${option.label} ${suffix}` : option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
