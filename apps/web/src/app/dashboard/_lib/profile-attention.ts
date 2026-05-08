import { hardMatchAttentionFieldForKey } from "../../../lib/hard-match";
import type { Question } from "./types";

export type ProfileAttentionTab = "self" | "partner" | "values";

const PROFILE_ATTENTION_HASH_PREFIX = "#profile-attention-";
const LEGACY_QUESTIONNAIRE_HASH_PREFIX = "#questionnaire-question-";

export function profileAttentionElementId(key: string) {
  return `profile-attention-${key}`;
}

export function profileAttentionHashForKey(key: string) {
  return `${PROFILE_ATTENTION_HASH_PREFIX}${encodeURIComponent(key)}`;
}

export function profileAttentionKeyFromHash(hash: string) {
  if (hash.startsWith(PROFILE_ATTENTION_HASH_PREFIX)) {
    return decodeURIComponent(hash.slice(PROFILE_ATTENTION_HASH_PREFIX.length));
  }

  if (hash.startsWith(LEGACY_QUESTIONNAIRE_HASH_PREFIX)) {
    return decodeURIComponent(
      hash.slice(LEGACY_QUESTIONNAIRE_HASH_PREFIX.length),
    );
  }

  return null;
}

export function profileAttentionTabForKey(
  key: string,
  questions: Question[],
): ProfileAttentionTab | null {
  const hardMatchField = hardMatchAttentionFieldForKey(key);
  if (hardMatchField) {
    return hardMatchField.tab;
  }

  return questions.some((question) => question.key === key) ? "values" : null;
}
