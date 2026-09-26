import {
  HARD_MATCH_WEIGHT_ACK,
  HARD_MATCH_WEIGHT_KEYS,
  hardMatchAttentionFields,
  hardMatchFieldHasValue,
  hardMatchFieldSignature,
  VIP_FILTER_KEYS,
} from '@lilink/shared';
import {
  isRecord,
  type QuestionnaireDraftQuestion,
} from './questionnaire-draft';
export type QuestionnaireAttentionQuestion = Omit<
  QuestionnaireDraftQuestion,
  'options'
> & {
  description?: string | null;
  options: unknown;
};
export type QuestionnaireAttentionItem = {
  key: string;
  prompt: string;
  updated: boolean;
  missingRequired: boolean;
  acknowledged: boolean;
};
export function normalizeAcknowledgedQuestionnaireKeys(rawKeys: unknown) {
  if (!Array.isArray(rawKeys)) {
    return [];
  }

  return [
    ...new Set(
      rawKeys
        .filter((key): key is string => typeof key === 'string')
        .map((key) => key.trim())
        .filter((key) => key.length > 0),
    ),
  ];
}
export function normalizeHardMatchSignatures(
  raw: unknown,
): Record<string, string> {
  if (!isRecord(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}
export function buildQuestionnaireAttention(args: {
  vipActive?: boolean;
  currentVersionId: string;
  currentQuestions: QuestionnaireAttentionQuestion[];
  filteredAnswers: Record<string, unknown>;
  acknowledgedVersionId: string | null | undefined;
  acknowledgedKeys: unknown;
  acknowledgedHardMatchSignatures: unknown;
}) {
  const acknowledgedKeys =
    args.acknowledgedVersionId === args.currentVersionId
      ? normalizeAcknowledgedQuestionnaireKeys(args.acknowledgedKeys)
      : [];
  const storedSignatures = normalizeHardMatchSignatures(
    args.acknowledgedHardMatchSignatures,
  );
  const itemsByKey = new Map<string, QuestionnaireAttentionItem>();

  for (const question of args.currentQuestions) {
    const answer = args.filteredAnswers[question.key];
    const missingRequired =
      !Object.prototype.hasOwnProperty.call(
        args.filteredAnswers,
        question.key,
      ) ||
      (question.type === 'MULTI_SELECT' &&
        question.selectionLimit != null &&
        Array.isArray(answer) &&
        answer.length !== question.selectionLimit);

    if (!missingRequired) {
      continue;
    }

    itemsByKey.set(question.key, {
      key: question.key,
      prompt: question.prompt,
      updated: false,
      missingRequired,
      acknowledged: true,
    });
  }

  for (const field of hardMatchAttentionFields()) {
    if (!args.vipActive && VIP_FILTER_KEYS.includes(field.key)) continue;
    const value = args.filteredAnswers[field.key];
    const present =
      Object.prototype.hasOwnProperty.call(args.filteredAnswers, field.key) &&
      hardMatchFieldHasValue(value);

    const enumSignature = hardMatchFieldSignature(field.key);
    const isWeight = HARD_MATCH_WEIGHT_KEYS.includes(field.key);

    // Whether this hard-match field is confirmed against the CURRENT schema,
    // decided purely by the stored signature — independent of the soft
    // questionnaire version, so a soft bump never re-nags a confirmed field.
    let signatureConfirmed: boolean;
    if (enumSignature !== null) {
      signatureConfirmed = storedSignatures[field.key] === enumSignature;
    } else if (isWeight) {
      signatureConfirmed =
        present || storedSignatures[field.key] === HARD_MATCH_WEIGHT_ACK;
    } else {
      signatureConfirmed = true;
    }

    const enumStale = enumSignature !== null && present && !signatureConfirmed;
    const weightNeedsConfirm = isWeight && !present && !signatureConfirmed;
    const updated = enumStale || weightNeedsConfirm;

    const missingRequired = field.required && !present;

    if (!updated && !missingRequired) {
      continue;
    }

    itemsByKey.set(field.key, {
      key: field.key,
      prompt: field.label,
      updated,
      missingRequired,
      acknowledged: signatureConfirmed,
    });
  }

  const items = [...itemsByKey.values()];
  const pendingUpdatedKeys = items
    .filter((item) => item.updated && !item.acknowledged)
    .map((item) => item.key);
  const missingRequiredKeys = items
    .filter((item) => item.missingRequired)
    .map((item) => item.key);

  return {
    currentVersionId: args.currentVersionId,
    acknowledgedKeys,
    pendingUpdatedKeys,
    missingRequiredKeys,
    pendingKeys: [...new Set([...pendingUpdatedKeys, ...missingRequiredKeys])],
    items,
  };
}
