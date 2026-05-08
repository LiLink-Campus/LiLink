"use client";

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
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
const PICKER_REOPEN_GUARD_MS = 350;
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
  triggerClassName,
  popoverMinWidth,
}: ValuePickerProps) {
  const reactId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const reopenGuardUntilRef = useRef(0);
  const ignoreTriggerClickUntilRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const isDesktop = useSyncExternalStore(
    subscribeDesktopMatch,
    getDesktopMatchSnapshot,
    getDesktopMatchServerSnapshot,
  );

  const closePicker = useCallback(() => {
    reopenGuardUntilRef.current = window.performance.now() + PICKER_REOPEN_GUARD_MS;
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
    if (window.performance.now() < reopenGuardUntilRef.current) {
      return;
    }

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

  const handleTriggerClick = useCallback(() => {
    if (window.performance.now() < ignoreTriggerClickUntilRef.current) {
      return;
    }

    togglePicker();
  }, [togglePicker]);

  const handleTriggerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse") {
        return;
      }

      if (window.performance.now() < ignoreTriggerClickUntilRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      ignoreTriggerClickUntilRef.current =
        window.performance.now() + PICKER_REOPEN_GUARD_MS;
      togglePicker();
    },
    [togglePicker],
  );

  const handleTriggerTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLButtonElement>) => {
      if (window.performance.now() < ignoreTriggerClickUntilRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      ignoreTriggerClickUntilRef.current =
        window.performance.now() + PICKER_REOPEN_GUARD_MS;
      togglePicker();
    },
    [togglePicker],
  );

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
      reopenGuardUntilRef.current =
        window.performance.now() + PICKER_REOPEN_GUARD_MS;
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
  const nativeDisplayClassName = triggerClassName
    ? `${triggerClassName} picker-native-display`
    : `picker-trigger picker-native-display${
        isPlaceholder ? " is-placeholder" : ""
      }`;
  const hasPlaceholderOption = options.some((option) => option.value === "");

  if (isDesktop === false) {
    return (
      <div className="picker-root">
        <div className="picker-native-wrap">
          <div
            className={`${nativeDisplayClassName}${
              disabled ? " is-disabled" : ""
            }`}
            aria-hidden="true"
          >
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
            aria-label={ariaLabel ?? labelHeading}
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
        onClick={handleTriggerClick}
        onPointerDown={handleTriggerPointerDown}
        onTouchStart={handleTriggerTouchStart}
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

    </div>
  );
}
