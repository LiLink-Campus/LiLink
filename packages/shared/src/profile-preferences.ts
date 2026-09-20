import {
  HARD_MATCH_KEYS,
  HARD_MATCH_LOOKS,
  HARD_MATCH_HEIGHT_MIN_CM,
  HARD_MATCH_HEIGHT_MAX_CM,
} from "./hard-match";

import { LIFESTYLE_QUESTIONS } from "./lifestyle";
export { LIFESTYLE_QUESTIONS } from "./lifestyle";

export function isLifestyleQuestion(key: string): boolean {
  return LIFESTYLE_QUESTIONS.some((question) => question.key === key);
}

export const VIP_FILTER_KEYS: readonly string[] = [
  HARD_MATCH_KEYS.partnerLooks,
  HARD_MATCH_KEYS.partnerExerciseFrequency,
  HARD_MATCH_KEYS.partnerHeightMin,
  HARD_MATCH_KEYS.partnerHeightMax,
  HARD_MATCH_KEYS.partnerWeightMin,
  HARD_MATCH_KEYS.partnerWeightMax,
  HARD_MATCH_KEYS.excludedPartnerSchools,
  HARD_MATCH_KEYS.excludedPartnerSchoolGenders,
];

export function hasActiveVip(
  grants:
    | readonly { expiresAt: Date | string | null; revokedAt: Date | string | null }[]
    | undefined,
  now = Date.now()
): boolean {
  return (
    grants?.some(
      (grant) =>
        grant.revokedAt === null &&
        grant.expiresAt !== null &&
        new Date(grant.expiresAt).getTime() > now
    ) ?? false
  );
}

export function effectiveMatchingAnswers(
  answers: Record<string, unknown>,
  vipActive: boolean
): Record<string, unknown> {
  if (vipActive) return { ...answers };
  return {
    ...answers,
    [HARD_MATCH_KEYS.partnerExerciseFrequency]: [],
    [HARD_MATCH_KEYS.partnerLooks]: [...HARD_MATCH_LOOKS],
    [HARD_MATCH_KEYS.partnerHeightMin]: HARD_MATCH_HEIGHT_MIN_CM,
    [HARD_MATCH_KEYS.partnerHeightMax]: HARD_MATCH_HEIGHT_MAX_CM,
    [HARD_MATCH_KEYS.partnerWeightMin]: null,
    [HARD_MATCH_KEYS.partnerWeightMax]: null,
    [HARD_MATCH_KEYS.excludedPartnerSchools]: [],
    [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [],
  };
}

export function effectivePreferenceForm<T extends object>(form: T, vipActive: boolean): T {
  if (vipActive) return form;
  return {
    ...form,
    partnerExerciseFrequency: [],
    partnerLooks: [...HARD_MATCH_LOOKS],
    partnerHeightMin: String(HARD_MATCH_HEIGHT_MIN_CM),
    partnerHeightMax: String(HARD_MATCH_HEIGHT_MAX_CM),
    partnerWeightMin: "",
    partnerWeightMax: "",
    excludedPartnerSchools: [],
    excludedPartnerSchoolGenders: [],
  };
}
