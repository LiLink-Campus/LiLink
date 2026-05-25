import {
  HARD_MATCH_GENDERS,
  HARD_MATCH_KEYS,
  readSingleChoice,
} from '@lilink/shared';
import { Prisma } from '../prisma/client';

export type GenderKey = 'male' | 'female' | 'nonBinary' | 'unknown';

export const GENDER_KEYS: readonly GenderKey[] = [
  'male',
  'female',
  'nonBinary',
  'unknown',
];

export interface GenderBuckets {
  male: number;
  female: number;
  nonBinary: number;
  unknown: number;
}

export function emptyGenderBuckets(): GenderBuckets {
  return { male: 0, female: 0, nonBinary: 0, unknown: 0 };
}

/**
 * Authoritative gender = the hard-matching questionnaire answer. Only counts a
 * submitted questionnaire; mirrors the legacy private impl in
 * promotion-dashboard.service. Returns the raw 男/女/非二元 string or null.
 */
export function resolveHardGender(
  response: { submittedAt: Date | null; answers: Prisma.JsonValue } | null,
): string | null {
  if (!response?.submittedAt) return null;
  const answers = response.answers;
  if (
    typeof answers !== 'object' ||
    answers === null ||
    Array.isArray(answers)
  ) {
    return null;
  }
  return readSingleChoice(
    (answers as Record<string, unknown>)[HARD_MATCH_KEYS.gender],
    HARD_MATCH_GENDERS,
  );
}

export function genderKey(gender: string | null): GenderKey {
  switch (gender) {
    case '男':
      return 'male';
    case '女':
      return 'female';
    case '非二元':
      return 'nonBinary';
    default:
      return 'unknown';
  }
}

export function addGender(buckets: GenderBuckets, gender: string | null): void {
  buckets[genderKey(gender)] += 1;
}
