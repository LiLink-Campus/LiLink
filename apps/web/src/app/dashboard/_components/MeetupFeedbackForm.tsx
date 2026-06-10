"use client";

import { dcx } from "../_lib/dashboard-class-names";
import {
  buildMeetupFeedbackPayload,
  createMeetupFeedbackFormState,
  INTERACTION_QUALITY_OPTIONS,
  ISSUE_TAG_OPTIONS,
  MEETUP_FEEDBACK_NOTE_MAX_LENGTH,
  MEETUP_FEEDBACK_TAG_MAX_COUNT,
  PERSONAL_FIT_OPTIONS,
  POSITIVE_TAG_OPTIONS,
  SAFETY_BOUNDARY_OPTIONS,
  toggleMeetupFeedbackTag,
  type MeetupFeedbackFormState,
  type MeetupFeedbackOption,
} from "../_lib/meetup-feedback";
import { buildDashboardFieldId } from "../_lib/format";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import type {
  MeetupFeedback,
  SubmitMeetupFeedbackPayload,
} from "../../../lib/api";

type MeetupFeedbackFormProps = {
  open: boolean;
  feedback: MeetupFeedback | null;
  saving: boolean;
  submitError: string | null;
  onSubmit: (payload: SubmitMeetupFeedbackPayload) => void;
  onCancel: () => void;
  onDismissSubmitError: () => void;
};

function ScoreOptions({
  disabled,
  options,
  value,
  onChange,
}: {
  disabled: boolean;
  options: MeetupFeedbackOption<number>[];
  value: number | null;
  onChange: (next: number) => void;
}) {
  return (
    <div className={dcx("meetup-feedback-options score-options")}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={dcx(
              `meetup-feedback-option${active ? " is-active" : ""}`,
            )}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            <span className={dcx("meetup-feedback-option-mark")}>
              {option.value}
            </span>
            <span className={dcx("meetup-feedback-option-body")}>
              <strong>{option.label}</strong>
              <small>{option.copy}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SafetyOptions({
  disabled,
  value,
  onChange,
}: {
  disabled: boolean;
  value: string | null;
  onChange: (next: string) => void;
}) {
  return (
    <div className={dcx("meetup-feedback-options")}>
      {SAFETY_BOUNDARY_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={dcx(
              `meetup-feedback-option${active ? " is-active" : ""}`,
            )}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            <span className={dcx("meetup-feedback-option-body")}>
              <strong>{option.label}</strong>
              <small>{option.copy}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TagOptions({
  disabled,
  options,
  selected,
  onToggle,
}: {
  disabled: boolean;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <div className={dcx("meetup-feedback-tags")}>
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            className={dcx(`meetup-feedback-tag${active ? " is-active" : ""}`)}
            aria-pressed={active}
            disabled={
              disabled ||
              (!active && selected.length >= MEETUP_FEEDBACK_TAG_MAX_COUNT)
            }
            onClick={() => onToggle(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Meetup-session feedback dialog. It replaces the old match-level feedback
 * flow and submits diagnostic feedback tied to the confirmed meetup session.
 */
export function MeetupFeedbackForm({
  open,
  feedback,
  saving,
  submitError,
  onSubmit,
  onCancel,
  onDismissSubmitError,
}: MeetupFeedbackFormProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [state, setState] = useState<MeetupFeedbackFormState>(() =>
    createMeetupFeedbackFormState(feedback),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setState(createMeetupFeedbackFormState(feedback));
      setError(null);
    }
  }, [feedback, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      restoreFocusRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  function updateState(next: Partial<MeetupFeedbackFormState>) {
    setState((current) => ({ ...current, ...next }));
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (saving) return;
    if (event.target === dialogRef.current) {
      onCancel();
    }
  }

  function submit() {
    const payload = buildMeetupFeedbackPayload(state);
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    setError(null);
    onSubmit(payload);
  }

  return (
    <dialog
      ref={dialogRef}
      className={dcx("v2-report-dialog meetup-feedback-dialog")}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onCancel();
      }}
      onClose={() => {
        if (open && !saving) onCancel();
      }}
      onClick={handleBackdropClick}
    >
      <div
        className={dcx("v2-report-dialog-inner meetup-feedback-dialog-inner")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={dcx("v2-report-dialog-head")}>
          <span className={dcx("v2-report-dialog-eyebrow")}>会后反馈</span>
          <h2 id={titleId}>会后反馈</h2>
          <p id={descriptionId}>
            这些反馈仅供平台诊断匹配和见面体验，对方不会看到。选择填写后，三项都需要完成。
          </p>
        </header>

        {submitError ? (
          <div className={dcx("meetup-feedback-toast")} role="alert">
            <span>{submitError}</span>
            <button
              type="button"
              aria-label="关闭反馈提交失败提示"
              onClick={onDismissSubmitError}
            >
              ×
            </button>
          </div>
        ) : null}

        <div className={dcx("v2-report-dialog-body meetup-feedback-body")}>
          {error ? (
            <p className={dcx("ui-form-message ui-form-message--error")}>
              {error}
            </p>
          ) : null}

          <section
            className={dcx("meetup-feedback-section")}
            aria-labelledby={`${titleId}-fit`}
          >
            <header>
              <h3 id={`${titleId}-fit`}>对你本人是否合适</h3>
              <p>只评价你自己的感觉、化学反应和偏好；不代表对方做错了什么。</p>
            </header>
            <div role="radiogroup" aria-label="个人契合感">
              <ScoreOptions
                disabled={saving}
                options={PERSONAL_FIT_OPTIONS}
                value={state.personalFitScore}
                onChange={(next) => updateState({ personalFitScore: next })}
              />
            </div>
          </section>

          <section
            className={dcx("meetup-feedback-section")}
            aria-labelledby={`${titleId}-quality`}
          >
            <header>
              <h3 id={`${titleId}-quality`}>相处和沟通体验</h3>
              <p>
                评价这次见面是否容易沟通、尊重彼此、自然推进；尽量和个人心动程度分开。
              </p>
            </header>
            <div role="radiogroup" aria-label="互动质量">
              <ScoreOptions
                disabled={saving}
                options={INTERACTION_QUALITY_OPTIONS}
                value={state.interactionQualityScore}
                onChange={(next) =>
                  updateState({ interactionQualityScore: next })
                }
              />
            </div>
          </section>

          <section
            className={dcx("meetup-feedback-section")}
            aria-labelledby={`${titleId}-safety`}
          >
            <header>
              <h3 id={`${titleId}-safety`}>安全与边界</h3>
              <p>
                这里只记录安全、骚扰、压力、身份或边界问题；单纯不来电请放在第一项。
              </p>
            </header>
            <div role="radiogroup" aria-label="安全与边界">
              <SafetyOptions
                disabled={saving}
                value={state.safetyBoundaryLevel}
                onChange={(next) => updateState({ safetyBoundaryLevel: next })}
              />
            </div>
          </section>

          <section className={dcx("meetup-feedback-section optional")}>
            <header>
              <h3>正向标签（可选）</h3>
              <p>选择这次见面里值得保留的信号。</p>
            </header>
            <TagOptions
              disabled={saving}
              options={POSITIVE_TAG_OPTIONS}
              selected={state.positiveTags}
              onToggle={(tag) =>
                updateState({
                  positiveTags: toggleMeetupFeedbackTag(
                    state.positiveTags,
                    tag,
                  ),
                })
              }
            />
          </section>

          <section className={dcx("meetup-feedback-section optional")}>
            <header>
              <h3>问题标签（可选）</h3>
              <p>如有不舒服或影响体验的情况，可以勾选给平台参考。</p>
            </header>
            <TagOptions
              disabled={saving}
              options={ISSUE_TAG_OPTIONS}
              selected={state.issueTags}
              onToggle={(tag) =>
                updateState({
                  issueTags: toggleMeetupFeedbackTag(state.issueTags, tag),
                })
              }
            />
          </section>

          <label className={dcx("v2-report-dialog-field")}>
            <span>补充说明（可选）</span>
            <textarea
              id={buildDashboardFieldId("meetup-feedback-note")}
              name="meetupFeedbackNote"
              rows={4}
              maxLength={MEETUP_FEEDBACK_NOTE_MAX_LENGTH}
              value={state.note}
              disabled={saving}
              placeholder="还有什么想让平台知道？请不要填写联系方式或敏感隐私。"
              onChange={(event) => updateState({ note: event.target.value })}
            />
          </label>
        </div>

        <footer className={dcx("v2-report-dialog-foot")}>
          <button
            className={dcx("ui-button ui-button--secondary")}
            disabled={saving}
            type="button"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className={dcx("ui-button ui-button--primary")}
            disabled={saving}
            type="button"
            onClick={submit}
          >
            {saving ? "提交中…" : "保存会后反馈"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
