import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { HARD_MATCH_WEIGHT_KEYS, VIP_FILTER_KEYS } from "@lilink/shared";
import { fetchApi } from "../../../lib/api";
import { hardMatchAttentionFields, type HardMatchFormState } from "../../../lib/hard-match";
import { softQuestionAnswerIsComplete } from "../_lib/questionnaire";
import { dcx } from "../_lib/dashboard-class-names";
import type {
  Question,
  QuestionnaireAttentionItem,
  SavedQuestionnairePayload,
} from "../_lib/types";
import { hardMatchFieldIsComplete, type ProfileTab } from "./profile-field-state";
import type { ProfileFieldRegistry } from "./use-profile-field-registry";
import type { QuestionnaireSavedEvent } from "./use-profile-autosave";
type QuestionnaireAcknowledgementResponse = {
  currentVersionId: string;
  acknowledgedKeys: string[];
};

const QUESTIONNAIRE_ATTENTION_VIEW_MS = 200;
function questionnaireAttentionText(item: QuestionnaireAttentionItem) {
  if (item.updated && !item.acknowledged && item.missingRequired) {
    return "本题有更新，且当前答案待补完。";
  }

  if (item.updated && !item.acknowledged) {
    return "本题有更新。";
  }

  return "本题待补完。";
}

export function useProfileAttention({
  initialAttention,
  answers,
  hardMatchForm,
  questions,
  vipActive,
  activeTab,
  questionBlockRefs,
}: {
  initialAttention: NonNullable<SavedQuestionnairePayload>["attention"] | null;
  answers: Record<string, unknown>;
  hardMatchForm: HardMatchFormState;
  questions: Question[];
  vipActive: boolean;
  activeTab: ProfileTab;
  questionBlockRefs: ProfileFieldRegistry["questionBlockRefs"];
}) {
  const questionnaireAttention = initialAttention;
  const [acknowledgedQuestionnaireKeys, setAcknowledgedQuestionnaireKeys] = useState<string[]>(
    () => questionnaireAttention?.acknowledgedKeys ?? []
  );
  const [acknowledgedHardMatchKeys, setAcknowledgedHardMatchKeys] = useState<string[]>([]);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const questionAttentionByKey = useMemo(() => {
    const acknowledgedKeys = new Set(acknowledgedQuestionnaireKeys);
    const acknowledgedHardMatchKeySet = new Set(acknowledgedHardMatchKeys);
    const hardMatchKeySet = new Set<string>(hardMatchAttentionFields().map((field) => field.key));
    const attentionByKey = new Map<string, QuestionnaireAttentionItem>();

    for (const item of questionnaireAttention?.items ?? []) {
      if (!vipActive && VIP_FILTER_KEYS.includes(item.key)) continue;
      attentionByKey.set(item.key, {
        ...item,
        // Hard-match acknowledgement is decided by the backend signature; only
        // soft questions fall back to the version-scoped acknowledgedKeys.
        acknowledged: hardMatchKeySet.has(item.key)
          ? item.acknowledged || acknowledgedHardMatchKeySet.has(item.key)
          : !item.updated || acknowledgedKeys.has(item.key),
      });
    }

    for (const field of hardMatchAttentionFields()) {
      if (!vipActive && VIP_FILTER_KEYS.includes(field.key)) continue;
      const current = attentionByKey.get(field.key);
      const missingRequired = field.required && !hardMatchFieldIsComplete(field.key, hardMatchForm);

      if (!missingRequired && !current?.updated) {
        attentionByKey.delete(field.key);
        continue;
      }

      if (!missingRequired && current) {
        attentionByKey.set(field.key, {
          ...current,
          missingRequired: false,
          // Preserve the backend signature-based acknowledgement set above.
          acknowledged: current.acknowledged,
        });
        continue;
      }

      if (missingRequired) {
        attentionByKey.set(field.key, {
          key: field.key,
          prompt: current?.prompt ?? field.label,
          updated: current?.updated ?? false,
          missingRequired: true,
          acknowledged: current?.updated
            ? current.acknowledged || acknowledgedHardMatchKeySet.has(field.key)
            : true,
        });
      }
    }

    for (const question of questions) {
      const missingRequired = !softQuestionAnswerIsComplete(question, answers[question.key]);

      const current = attentionByKey.get(question.key);
      if (!missingRequired) {
        if (current?.updated)
          attentionByKey.set(question.key, { ...current, missingRequired: false });
        else attentionByKey.delete(question.key);
        continue;
      }

      attentionByKey.set(question.key, {
        key: question.key,
        prompt: question.prompt,
        updated: current?.updated ?? false,
        missingRequired: true,
        acknowledged: current?.updated ? acknowledgedKeys.has(question.key) : true,
      });
    }

    return attentionByKey;
  }, [
    vipActive,
    acknowledgedHardMatchKeys,
    acknowledgedQuestionnaireKeys,
    answers,
    hardMatchForm,
    questionnaireAttention,
    questions,
  ]);

  const pendingUpdatedAttentionKeys = useMemo(
    () =>
      [...questionAttentionByKey.values()]
        .filter((item) => item.updated && !item.acknowledged)
        .map((item) => item.key),
    [questionAttentionByKey]
  );

  // Weight nudges clear only on an explicit save, never by passively scrolling
  // the field into view, so the auto-acknowledge observer skips weight keys.
  const autoAcknowledgeKeys = useMemo(
    () => pendingUpdatedAttentionKeys.filter((key) => !HARD_MATCH_WEIGHT_KEYS.includes(key)),
    [pendingUpdatedAttentionKeys]
  );

  function attentionItemForKeys(keys: readonly string[]) {
    return (
      keys
        .map((key) => questionAttentionByKey.get(key))
        .find(
          (item) => item != null && (item.missingRequired || (item.updated && !item.acknowledged))
        ) ?? null
    );
  }

  function attentionBlockClassName(keys: readonly string[]) {
    return dcx(
      attentionItemForKeys(keys) ? "question-block question-block-attention" : "question-block"
    );
  }

  function renderAttentionNote(keys: readonly string[]) {
    const item = attentionItemForKeys(keys);
    return item ? (
      <p className={dcx("question-attention-note")}>{questionnaireAttentionText(item)}</p>
    ) : null;
  }

  async function acknowledgeQuestionnaireKeys(keys: string[]) {
    if (!questionnaireAttention || keys.length === 0) {
      return;
    }

    try {
      const result = await fetchApi<QuestionnaireAcknowledgementResponse>(
        "/me/questionnaire/acknowledgement",
        {
          method: "PUT",
          body: JSON.stringify({
            versionId: questionnaireAttention.currentVersionId,
            keys,
          }),
        }
      );

      if (mounted.current) {
        setAcknowledgedQuestionnaireKeys(result.acknowledgedKeys);
        const hardMatchKeySet = new Set<string>(
          hardMatchAttentionFields().map((field) => field.key)
        );
        const hardMatchKeys = keys.filter((key) => hardMatchKeySet.has(key));
        if (hardMatchKeys.length > 0) {
          setAcknowledgedHardMatchKeys((current) => [...new Set([...current, ...hardMatchKeys])]);
        }
      }
    } catch {
      // Keep the marker visible; the next viewport pass can retry.
    }
  }

  const acknowledgeVisibleKeys = useEffectEvent(acknowledgeQuestionnaireKeys);
  useEffect(() => {
    if (
      !questionnaireAttention ||
      autoAcknowledgeKeys.length === 0 ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const timers = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const keys = autoAcknowledgeKeys.filter(
            (key) => questionBlockRefs.current.get(key) === entry.target
          );
          if (keys.length === 0) {
            continue;
          }
          const timerKey = keys.join("\u0000");

          if (!entry.isIntersecting) {
            const timer = timers.get(timerKey);
            if (timer != null) {
              window.clearTimeout(timer);
              timers.delete(timerKey);
            }
            continue;
          }

          if (timers.has(timerKey)) {
            continue;
          }

          const timeoutId = window.setTimeout(() => {
            timers.delete(timerKey);
            observer.unobserve(entry.target);
            void acknowledgeVisibleKeys(keys);
          }, QUESTIONNAIRE_ATTENTION_VIEW_MS);
          timers.set(timerKey, timeoutId);
        }
      },
      { threshold: 0.35 }
    );

    const observedNodes = new Set<HTMLFieldSetElement>();
    for (const key of autoAcknowledgeKeys) {
      const node = questionBlockRefs.current.get(key);
      if (node && !observedNodes.has(node)) {
        observedNodes.add(node);
        observer.observe(node);
      }
    }

    return () => {
      observer.disconnect();
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
    };
  }, [activeTab, autoAcknowledgeKeys, questionnaireAttention, questionBlockRefs]);

  function onQuestionnaireSaved({ payload, result }: QuestionnaireSavedEvent) {
    const savedWeightKeys = HARD_MATCH_WEIGHT_KEYS.filter((key) =>
      hardMatchFieldIsComplete(key, payload.hardMatchForm)
    );
    if (savedWeightKeys.length) void acknowledgeQuestionnaireKeys(savedWeightKeys);
    if (result.saveState === "SUBMITTED") {
      setAcknowledgedQuestionnaireKeys(questions.map((question) => question.key));
      setAcknowledgedHardMatchKeys(hardMatchAttentionFields().map((field) => field.key));
    }
  }
  return {
    attentionBlockClassName,
    renderAttentionNote,
    onQuestionnaireSaved,
  };
}

export type ProfileAttentionDisplay = Pick<
  ReturnType<typeof useProfileAttention>,
  "attentionBlockClassName" | "renderAttentionNote"
>;
