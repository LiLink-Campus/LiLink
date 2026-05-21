import {
  type HardMatchGender,
  type HardMatchSchoolGenderExclusion,
  type HardMatchSchoolId,
} from "./hard-match";

/**
 * Coarse, scale-independent match-odds bands shown to a user while they edit
 * their partner-school / partner-gender exclusions. The band is derived purely
 * from the *retention ratio* (how large a share of the current opted-in
 * candidate pool survives the exclusions), never from an absolute headcount, so
 * raw pool sizes are never exposed to the client.
 */
export const MATCH_ESTIMATE_BANDS = [
  "HIGH",
  "MEDIUM",
  "LOW",
  "VERY_LOW",
] as const;

export type MatchEstimateBand = (typeof MATCH_ESTIMATE_BANDS)[number];

/**
 * Retention-ratio cut-offs (remaining / base). A pair's band is the highest tier
 * whose threshold the ratio meets. Tunable; kept here as the single source of
 * truth so the API and its tests agree.
 */
export const MATCH_ESTIMATE_RATIO_THRESHOLDS = {
  high: 0.6,
  medium: 0.35,
  low: 0.15,
} as const;

/**
 * Below this many candidates in the base pool the ratio is statistically noisy
 * (one person joining/leaving swings it a lot), so callers flag the estimate as
 * low-confidence and soften the copy. This flag intentionally exposes only a
 * coarse aggregate ("the pool is small"), never a precise count.
 */
export const MATCH_ESTIMATE_LOW_CONFIDENCE_BASE = 8;

export type SchoolGenderCount = {
  schoolId: HardMatchSchoolId;
  gender: HardMatchGender;
  count: number;
};

export type MatchEstimateExclusions = {
  excludedPartnerSchools: HardMatchSchoolId[];
  excludedPartnerSchoolGenders: HardMatchSchoolGenderExclusion[];
};

export type MatchEstimateResult = {
  band: MatchEstimateBand;
  /** True when the base pool is too small for the ratio to be meaningful. */
  lowConfidence: boolean;
};

/**
 * Count how many candidates survive the exclusions. A candidate `(school,
 * gender)` is excluded iff its school is fully excluded, or that specific
 * `(school, gender)` pair is gender-excluded — mirroring the exclusion arm of
 * `areHardMatchAnswersCompatible`.
 */
export function countRemainingCandidates(
  counts: readonly SchoolGenderCount[],
  exclusions: MatchEstimateExclusions,
): number {
  const fullyExcludedSchools = new Set(exclusions.excludedPartnerSchools);
  const excludedGendersBySchool = new Map<string, Set<HardMatchGender>>();
  for (const entry of exclusions.excludedPartnerSchoolGenders) {
    if (fullyExcludedSchools.has(entry.schoolId)) {
      continue;
    }

    const genders =
      excludedGendersBySchool.get(entry.schoolId) ??
      new Set<HardMatchGender>();
    for (const gender of entry.genders) {
      genders.add(gender);
    }
    excludedGendersBySchool.set(entry.schoolId, genders);
  }

  let remaining = 0;
  for (const { schoolId, gender, count } of counts) {
    if (fullyExcludedSchools.has(schoolId)) {
      continue;
    }
    if (excludedGendersBySchool.get(schoolId)?.has(gender)) {
      continue;
    }

    remaining += count;
  }

  return remaining;
}

/**
 * Map a `(remaining, base)` candidate count to a coarse band. `base` must
 * already exclude the requesting user. A non-positive base means there is no
 * pool to estimate against, which reads as the lowest band with low confidence.
 */
export function bandForRetentionRatio(
  remaining: number,
  base: number,
): MatchEstimateResult {
  if (base <= 0) {
    return { band: "VERY_LOW", lowConfidence: true };
  }

  const ratio = Math.max(0, Math.min(remaining, base)) / base;
  const thresholds = MATCH_ESTIMATE_RATIO_THRESHOLDS;
  let band: MatchEstimateBand;
  if (ratio >= thresholds.high) {
    band = "HIGH";
  } else if (ratio >= thresholds.medium) {
    band = "MEDIUM";
  } else if (ratio >= thresholds.low) {
    band = "LOW";
  } else {
    band = "VERY_LOW";
  }

  return {
    band,
    lowConfidence: base < MATCH_ESTIMATE_LOW_CONFIDENCE_BASE,
  };
}

/**
 * Estimate the match-odds band for a candidate pool (already excluding the
 * requesting user) against the user's current exclusions.
 */
export function estimateMatchBand(
  counts: readonly SchoolGenderCount[],
  exclusions: MatchEstimateExclusions,
): MatchEstimateResult {
  const base = counts.reduce((sum, entry) => sum + entry.count, 0);
  const remaining = countRemainingCandidates(counts, exclusions);
  return bandForRetentionRatio(remaining, base);
}
