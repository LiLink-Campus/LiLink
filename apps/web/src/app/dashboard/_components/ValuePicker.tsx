"use client";

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

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
  /** Title shown at the top of the bottom sheet on mobile. */
  sheetTitle?: string;
  /** Optional sub-text under the sheet title. */
  sheetSubtitle?: ReactNode;
  /** Override the trigger className (defaults to picker-trigger). */
  triggerClassName?: string;
  /** Width hint for desktop popover; defaults to trigger width. */
  popoverMinWidth?: number;
};

const DESKTOP_BREAKPOINT_PX = 768;
const SCROLL_OFFSET_PX = 96;
const PICKER_OPTION_PX = 44;
const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_BREAKPOINT_PX}px)`;

function subscribeDesktopMatch(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const media = window.matchMedia(DESKTOP_MEDIA_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getDesktopMatchSnapshot(): boolean {
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

function getDesktopMatchServerSnapshot(): null {
  return null;
}

/**
 * Responsive value picker.
 *
 * Triggers as a pill-shaped button styled to fit the dashboard's design
 * language. On taps, it opens:
 *   - bottom sheet on mobile (<768px), keyboard-friendly + thumb-friendly
 *   - popover anchored under the trigger on desktop (≥768px)
 *
 * Replaces native `<select>` for numeric fields where the OS-level option
 * list looks out of place inside the app shell.
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
  sheetSubtitle,
  triggerClassName,
  popoverMinWidth,
}: ValuePickerProps) {
  const reactId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const isDesktop = useSyncExternalStore(
    subscribeDesktopMatch,
    getDesktopMatchSnapshot,
    getDesktopMatchServerSnapshot,
  );

  const closePicker = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const selectedOptionIndex = options.findIndex(
    (option) => option.value === value,
  );
  const selectedOption =
    selectedOptionIndex >= 0 ? options[selectedOptionIndex] : null;

  const getInitialActiveOptionIndex = useCallback(() => {
    if (selectedOptionIndex >= 0) return selectedOptionIndex;
    return options.length > 0 ? 0 : -1;
  }, [options.length, selectedOptionIndex]);

  const focusOption = useCallback((optionIndex: number) => {
    const list = listRef.current;
    if (!list) return;
    const option = list.querySelector<HTMLLIElement>(
      `[data-option-index="${optionIndex}"]`,
    );
    option?.focus({ preventScroll: true });
  }, []);

  const togglePicker = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }

    const initialIndex = getInitialActiveOptionIndex();
    if (initialIndex >= 0) {
      setActiveOptionIndex(initialIndex);
    }
    setOpen(true);
  }, [getInitialActiveOptionIndex, open]);

  useEffect(() => {
    if (!open) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
      }
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (sheetRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    if (isDesktop === false) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
        document.removeEventListener("keydown", handleKey);
        document.removeEventListener("mousedown", handlePointerDown);
        document.removeEventListener("touchstart", handlePointerDown);
      };
    }

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open, isDesktop, closePicker]);

  useEffect(() => {
    if (!open) return;
    if (activeOptionIndex < 0) return;
    const frame = window.requestAnimationFrame(() =>
      focusOption(activeOptionIndex),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [open, activeOptionIndex, focusOption]);

  // Keep the keyboard-focused item in view while navigating long lists.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const frame = window.requestAnimationFrame(() => {
      const activeItem = list.querySelector<HTMLLIElement>(
        '[data-active="true"]',
      );
      if (!activeItem) return;
      list.scrollTop = Math.max(0, activeItem.offsetTop - SCROLL_OFFSET_PX);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, activeOptionIndex]);

  const triggerLabel = selectedOption
    ? suffix
      ? `${selectedOption.label} ${suffix}`
      : selectedOption.label
    : placeholder;
  const isPlaceholder = !selectedOption;

  const selectOption = useCallback(
    (option: ValuePickerOption) => {
      onChange(option.value);
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    },
    [onChange],
  );

  const moveActiveOption = useCallback(
    (nextIndex: number) => {
      if (options.length === 0) return;
      const boundedIndex = Math.min(Math.max(nextIndex, 0), options.length - 1);
      setActiveOptionIndex(boundedIndex);
      focusOption(boundedIndex);
    },
    [focusOption, options.length],
  );

  function handleOptionListKeyDown(
    event: ReactKeyboardEvent<HTMLUListElement>,
  ) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActiveOption(activeOptionIndex + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        moveActiveOption(activeOptionIndex - 1);
        return;
      case "Home":
        event.preventDefault();
        moveActiveOption(0);
        return;
      case "End":
        event.preventDefault();
        moveActiveOption(options.length - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (activeOptionIndex >= 0) {
          const activeOption = options[activeOptionIndex];
          if (activeOption) selectOption(activeOption);
        }
        return;
      case "Escape":
        event.preventDefault();
        closePicker();
        return;
      default:
        return;
    }
  }

  function renderOptionList(idPrefix: string) {
    return (
      <ul
        ref={listRef}
        role="listbox"
        aria-labelledby={`${idPrefix}-label`}
        className="picker-list"
        onKeyDown={handleOptionListKeyDown}
      >
        {options.map((option, optionIndex) => {
          const selected = option.value === value;
          const active = optionIndex === activeOptionIndex;
          const optionId = `${idPrefix}-opt-${option.value}`;
          return (
            <li
              key={option.value}
              id={optionId}
              role="option"
              aria-selected={selected}
              tabIndex={active ? 0 : -1}
              data-active={active ? "true" : undefined}
              data-option-index={optionIndex}
              className={
                selected ? "picker-option is-active" : "picker-option"
              }
              style={{ minHeight: `${PICKER_OPTION_PX}px` }}
              onClick={() => selectOption(option)}
              onFocus={() => setActiveOptionIndex(optionIndex)}
            >
              <span>{option.label}</span>
              {suffix ? (
                <span className="picker-option-suffix">{suffix}</span>
              ) : null}
              {selected ? (
                <span className="picker-option-check" aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  const labelHeading = ariaLabel ?? sheetTitle ?? placeholder;

  return (
    <div className="picker-root">
      <button
        ref={triggerRef}
        id={id}
        name={name}
        type="button"
        className={
          triggerClassName ??
          `picker-trigger${isPlaceholder ? " is-placeholder" : ""}`
        }
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={togglePicker}
      >
        <span className="picker-trigger-text">{triggerLabel}</span>
        <span className="picker-trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && isDesktop === true ? (
        <div
          ref={popoverRef}
          className="picker-popover"
          role="dialog"
          aria-label={labelHeading}
          style={
            {
              "--picker-min-width": popoverMinWidth
                ? `${popoverMinWidth}px`
                : "100%",
            } as CSSProperties
          }
        >
          <p id={`${reactId}-label`} className="picker-popover-label">
            {sheetTitle ?? labelHeading}
          </p>
          {renderOptionList(reactId)}
        </div>
      ) : null}

      {open && isDesktop === false ? (
        <div className="picker-sheet-root" role="presentation">
          <button
            type="button"
            className="picker-sheet-backdrop"
            aria-label="关闭选择器"
            onClick={closePicker}
          />
          <div
            ref={sheetRef}
            className="picker-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={labelHeading}
          >
            <div className="picker-sheet-handle" aria-hidden="true" />
            <div className="picker-sheet-head">
              <button
                type="button"
                className="picker-sheet-cancel"
                onClick={closePicker}
              >
                取消
              </button>
              <p id={`${reactId}-label`} className="picker-sheet-title">
                {sheetTitle ?? labelHeading}
              </p>
              <span className="picker-sheet-spacer" aria-hidden="true" />
            </div>
            {sheetSubtitle ? (
              <p className="picker-sheet-subtitle">{sheetSubtitle}</p>
            ) : null}
            {renderOptionList(reactId)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
