import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  createAutosaveLifecycleGate,
  createAutosaveTimeoutController,
  takeNextAutosaveQueueItem,
} from "@lilink/shared";
import { fetchApi, isApiRequestError } from "../../../lib/api";
import { beginProfileWrite } from "../_lib/profile-read-revision";
import { useProfileWriteOwner } from "../_lib/profile-write-owner";
import type { HardMatchFormState } from "@lilink/shared";

export type QuestionnaireSavePayload = {
  answers: Record<string, unknown>;
  hardMatchForm: HardMatchFormState;
  displayName: string;
};

export type QuestionnaireSaveResponse = {
  saveState: "DRAFT" | "SUBMITTED";
  questionnaireSubmittedAt: string | null;
  hasDraft: boolean;
};

type QuestionnaireAutosaveState =
  | "idle"
  | "pending"
  | "saving"
  | "retrying"
  | "draft-saved"
  | "submitted"
  | "error";

const QUESTIONNAIRE_AUTOSAVE_RETRY_DELAYS_MS = [1500, 3000, 5000, 10000];
const QUESTIONNAIRE_AUTOSAVE_MAX_RETRY_ATTEMPTS = QUESTIONNAIRE_AUTOSAVE_RETRY_DELAYS_MS.length;
const QUESTIONNAIRE_AUTOSAVE_TIMEOUT_MS = 15000;
function questionnaireAutosaveRetryDelayMs(attemptNumber: number) {
  const retryIndex = Math.max(0, attemptNumber - 1);
  return QUESTIONNAIRE_AUTOSAVE_RETRY_DELAYS_MS[
    Math.min(retryIndex, QUESTIONNAIRE_AUTOSAVE_RETRY_DELAYS_MS.length - 1)
  ];
}

function questionnaireAutosaveShouldRetry(error: unknown) {
  if (!isApiRequestError(error)) {
    return true;
  }

  return error.status >= 500;
}

function questionnaireAutosaveFailureMessage(error: unknown, retryDelayMs: number | null) {
  if (isApiRequestError(error) && error.status >= 400 && error.status < 500) {
    return "当前页面数据已失效或填写内容未通过校验，请刷新页面后重试。";
  }

  return retryDelayMs == null
    ? "问卷自动保存多次失败，请检查当前填写内容后立即重试。"
    : `问卷自动保存失败，系统将在 ${Math.ceil(retryDelayMs / 1000)} 秒后自动重试。`;
}

export type QuestionnaireSavedEvent = {
  result: QuestionnaireSaveResponse;
  payload: QuestionnaireSavePayload;
  snapshot: string;
};
export function useProfileAutosave({
  userId,
  payload,
  versionId,
  initiallyHasDraft,
  initialSubmittedAt,
  onSaved,
}: {
  userId: string;
  payload: QuestionnaireSavePayload;
  versionId?: string | null;
  initiallyHasDraft: boolean;
  initialSubmittedAt: string | null;
  onSaved: (event: QuestionnaireSavedEvent) => void;
}) {
  const writeOwner = useProfileWriteOwner();
  const [submittedAt, setSubmittedAt] = useState(initialSubmittedAt);
  const [questionnaireSaveError, setQuestionnaireSaveError] = useState<string | null>(null);
  const [questionnaireSaveState, setQuestionnaireSaveState] = useState<QuestionnaireAutosaveState>(
    initiallyHasDraft ? "draft-saved" : "idle"
  );
  const [questionnaireManualRetryTick, setQuestionnaireManualRetryTick] = useState(0);
  const [hasQuestionnaireDraft, setHasQuestionnaireDraft] = useState(initiallyHasDraft);
  const questionnaireAutosaveReady = useRef(false);
  const questionnaireSaveAbortRef = useRef<AbortController | null>(null);
  const questionnaireSaveInFlightRef = useRef(false);
  const questionnaireRetryTimerRef = useRef<number | null>(null);
  const questionnaireRetryAttemptRef = useRef(0);
  const queuedQuestionnaireSaveRef = useRef<{
    payload: QuestionnaireSavePayload;
    snapshot: string;
  } | null>(null);
  const [questionnaireAutosaveLifecycle] = useState(createAutosaveLifecycleGate);
  const lastSavedQuestionnaireSnapshotRef = useRef(JSON.stringify(payload));
  const questionnaireSnapshot = useMemo(() => JSON.stringify(payload), [payload]);
  function clearQuestionnaireRetryTimer() {
    if (questionnaireRetryTimerRef.current == null) {
      return;
    }

    window.clearTimeout(questionnaireRetryTimerRef.current);
    questionnaireRetryTimerRef.current = null;
  }

  useEffect(() => {
    questionnaireAutosaveLifecycle.markMounted();

    return () => {
      questionnaireAutosaveLifecycle.markUnmounted();
      clearQuestionnaireRetryTimer();
      queuedQuestionnaireSaveRef.current = null;
      // Let the sent write settle under its deadline; unmount cannot undo it.
    };
  }, [questionnaireAutosaveLifecycle]);

  const flushQueuedQuestionnaireSave = useEffectEvent(
    async (payload: QuestionnaireSavePayload, snapshot: string) => {
      let shouldScheduleRetry = false;
      let shouldStopRetryingCurrentSnapshot = false;
      let retryDelayMs: number | null = null;
      const lifecycleToken = questionnaireAutosaveLifecycle.currentToken();

      if (
        !questionnaireAutosaveLifecycle.isTokenActive(lifecycleToken) ||
        questionnaireSaveInFlightRef.current ||
        snapshot === lastSavedQuestionnaireSnapshotRef.current
      ) {
        return;
      }

      const autosaveTimeout = createAutosaveTimeoutController(QUESTIONNAIRE_AUTOSAVE_TIMEOUT_MS);

      questionnaireSaveInFlightRef.current = true;
      questionnaireSaveAbortRef.current = autosaveTimeout.controller;
      setQuestionnaireSaveState(questionnaireRetryAttemptRef.current > 0 ? "retrying" : "saving");
      setQuestionnaireSaveError(null);

      const write = beginProfileWrite(userId, writeOwner);
      try {
        const result = await fetchApi<QuestionnaireSaveResponse>(
          "/me/questionnaire",
          {
            method: "PUT",
            body: JSON.stringify({ ...payload, versionId }),
            signal: autosaveTimeout.signal,
          },
          questionnaireRetryAttemptRef.current > 0 ? undefined : "/api/questionnaire"
        );

        write.succeeded();
        if (!questionnaireAutosaveLifecycle.isTokenActive(lifecycleToken)) {
          return;
        }

        clearQuestionnaireRetryTimer();
        questionnaireRetryAttemptRef.current = 0;
        lastSavedQuestionnaireSnapshotRef.current = snapshot;
        setHasQuestionnaireDraft(result.hasDraft);
        setSubmittedAt(result.questionnaireSubmittedAt);
        onSaved({ result, payload, snapshot });
        setQuestionnaireSaveState(result.saveState === "SUBMITTED" ? "submitted" : "draft-saved");
      } catch (caughtError) {
        if (!questionnaireAutosaveLifecycle.isTokenActive(lifecycleToken)) {
          return;
        }

        if (
          caughtError instanceof Error &&
          caughtError.name === "AbortError" &&
          !autosaveTimeout.hasTimedOut()
        ) {
          return;
        }

        if (
          !queuedQuestionnaireSaveRef.current ||
          queuedQuestionnaireSaveRef.current.snapshot === snapshot
        ) {
          queuedQuestionnaireSaveRef.current = { payload, snapshot };
        }

        if (questionnaireAutosaveShouldRetry(caughtError)) {
          questionnaireRetryAttemptRef.current += 1;
          if (questionnaireRetryAttemptRef.current <= QUESTIONNAIRE_AUTOSAVE_MAX_RETRY_ATTEMPTS) {
            retryDelayMs = questionnaireAutosaveRetryDelayMs(questionnaireRetryAttemptRef.current);
            shouldScheduleRetry = true;
          } else {
            shouldStopRetryingCurrentSnapshot = true;
          }
        } else {
          shouldStopRetryingCurrentSnapshot = true;
        }

        setQuestionnaireSaveState(shouldScheduleRetry ? "retrying" : "error");
        setQuestionnaireSaveError(
          shouldScheduleRetry
            ? null
            : questionnaireAutosaveFailureMessage(caughtError, retryDelayMs)
        );
      } finally {
        write.finish();
        autosaveTimeout.clear();
        questionnaireSaveAbortRef.current = null;
        questionnaireSaveInFlightRef.current = false;

        const nextQueuedSave = takeNextAutosaveQueueItem(queuedQuestionnaireSaveRef.current, {
          isUnmounted: questionnaireAutosaveLifecycle.isUnmounted(),
          lastSavedSnapshot: lastSavedQuestionnaireSnapshotRef.current,
        });
        if (nextQueuedSave) {
          if (shouldScheduleRetry && retryDelayMs != null && nextQueuedSave.snapshot === snapshot) {
            queuedQuestionnaireSaveRef.current = nextQueuedSave;
            clearQuestionnaireRetryTimer();
            questionnaireRetryTimerRef.current = window.setTimeout(() => {
              questionnaireRetryTimerRef.current = null;
              if (questionnaireAutosaveLifecycle.isUnmounted()) {
                return;
              }

              const retrySave = takeNextAutosaveQueueItem(queuedQuestionnaireSaveRef.current, {
                isUnmounted: questionnaireAutosaveLifecycle.isUnmounted(),
                lastSavedSnapshot: lastSavedQuestionnaireSnapshotRef.current,
              });
              if (!retrySave) {
                return;
              }

              queuedQuestionnaireSaveRef.current = null;
              setQuestionnaireSaveState("pending");
              setQuestionnaireSaveError(null);
              void flushQueuedQuestionnaireSave(retrySave.payload, retrySave.snapshot);
            }, retryDelayMs);
            return;
          }

          if (shouldStopRetryingCurrentSnapshot && nextQueuedSave.snapshot === snapshot) {
            clearQuestionnaireRetryTimer();
            queuedQuestionnaireSaveRef.current = null;
            return;
          }

          clearQuestionnaireRetryTimer();
          questionnaireRetryAttemptRef.current = 0;
          queuedQuestionnaireSaveRef.current = null;
          void flushQueuedQuestionnaireSave(nextQueuedSave.payload, nextQueuedSave.snapshot);
        }
      }
    }
  );

  const queueQuestionnaireSave = useEffectEvent(
    (payload: QuestionnaireSavePayload, snapshot: string) => {
      clearQuestionnaireRetryTimer();

      if (snapshot === lastSavedQuestionnaireSnapshotRef.current) {
        questionnaireRetryAttemptRef.current = 0;
        queuedQuestionnaireSaveRef.current = null;
        // A concurrent save already persisted this snapshot; clear stale indicator.
        setQuestionnaireSaveState((current) =>
          current === "pending" || current === "retrying" || current === "error" ? "idle" : current
        );
        setQuestionnaireSaveError(null);
        return;
      }

      if (questionnaireSaveInFlightRef.current) {
        queuedQuestionnaireSaveRef.current = { payload, snapshot };
        setQuestionnaireSaveState("saving");
        setQuestionnaireSaveError(null);
        return;
      }

      void flushQueuedQuestionnaireSave(payload, snapshot);
    }
  );

  useEffect(() => {
    if (!questionnaireAutosaveReady.current) {
      questionnaireAutosaveReady.current = true;
      return;
    }

    if (questionnaireSnapshot === lastSavedQuestionnaireSnapshotRef.current) {
      // Snapshot reverted to the last-saved state (user undid a change).
      // Clear any stale "pending" or "error" indicator that was set before
      // the timer could fire, so the UI doesn't stay frozen on a false alarm.
      setQuestionnaireSaveState((current) =>
        current === "pending" || current === "retrying" || current === "error" ? "idle" : current
      );
      setQuestionnaireSaveError(null);
      return;
    }

    clearQuestionnaireRetryTimer();
    questionnaireRetryAttemptRef.current = 0;
    setQuestionnaireSaveState("pending");
    setQuestionnaireSaveError(null);

    const timeoutId = window.setTimeout(() => {
      queueQuestionnaireSave(payload, questionnaireSnapshot);
    }, 800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [payload, questionnaireSnapshot]);

  useEffect(() => {
    if (questionnaireManualRetryTick === 0) {
      return;
    }

    clearQuestionnaireRetryTimer();
    questionnaireRetryAttemptRef.current = 0;

    const retrySave =
      takeNextAutosaveQueueItem(queuedQuestionnaireSaveRef.current, {
        isUnmounted: questionnaireAutosaveLifecycle.isUnmounted(),
        lastSavedSnapshot: lastSavedQuestionnaireSnapshotRef.current,
      }) ??
      (questionnaireAutosaveLifecycle.isUnmounted() ||
      questionnaireSaveInFlightRef.current ||
      questionnaireSnapshot === lastSavedQuestionnaireSnapshotRef.current
        ? null
        : {
            payload,
            snapshot: questionnaireSnapshot,
          });

    if (!retrySave) {
      return;
    }

    queuedQuestionnaireSaveRef.current = null;
    setQuestionnaireSaveState("pending");
    setQuestionnaireSaveError(null);
    void flushQueuedQuestionnaireSave(retrySave.payload, retrySave.snapshot);
  }, [
    questionnaireManualRetryTick,
    questionnaireAutosaveLifecycle,
    payload,
    questionnaireSnapshot,
  ]);

  return {
    state: questionnaireSaveState,
    error: questionnaireSaveError,
    hasDraft: hasQuestionnaireDraft,
    hasSaved: Boolean(submittedAt),
    hasUnsavedChanges: questionnaireSnapshot !== lastSavedQuestionnaireSnapshotRef.current,
    retry: () => setQuestionnaireManualRetryTick((tick) => tick + 1),
  };
}
