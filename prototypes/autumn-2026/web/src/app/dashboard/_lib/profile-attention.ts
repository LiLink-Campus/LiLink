import { hardMatchAttentionFieldForKey } from "../../../lib/hard-match";
import type { Question } from "./types";
import {
  profileAttentionElementId as sharedProfileAttentionElementId,
  profileAttentionHashForKey as sharedProfileAttentionHashForKey,
  profileAttentionKeyFromHash as sharedProfileAttentionKeyFromHash,
} from "@lilink/shared";

export type ProfileAttentionTab = "self" | "partner" | "values";

export const profileAttentionElementId = sharedProfileAttentionElementId;
export const profileAttentionHashForKey = sharedProfileAttentionHashForKey;
export const profileAttentionKeyFromHash = sharedProfileAttentionKeyFromHash;

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
