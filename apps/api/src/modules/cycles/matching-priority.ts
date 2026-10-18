import { BadRequestException } from '@nestjs/common';
import type { MatchScoreBounds, RetentionWeightTiers } from './matching-types';
const NORMALIZED_SCORE_MAX = 100;
const COMPATIBILITY_SCORE_SCALE = 1_000_000;
const SCORE_SCALE = BigInt(COMPATIBILITY_SCORE_SCALE);
const PRIORITY_UNMATCHED_STREAK_THRESHOLD = 2;
const PRE_PRIORITY_UNMATCHED_STREAK_BONUS = 2;
// First-cycle boost: a small, lowest-tier nudge so users in their very first
// opt-in cycle are slightly more likely to be matched, improving the first
// experience and retention. Lives at the same tier as rawScore — it never
// overrides the unmatched-priority, VIP, or matched-user tiers. Applied
// linearly per first-cycle user on a pair (one new user +N, both new +2N).
const NEW_OPT_IN_FIRST_CYCLE_BONUS = 6;

export function buildRetentionWeightTiers(
  participantCount: number,
  scoreBounds: MatchScoreBounds,
): RetentionWeightTiers {
  if (!Number.isSafeInteger(participantCount) || participantCount < 0) {
    throw new BadRequestException('Matching participant count is invalid.');
  }
  const maxPairCount = BigInt(Math.max(1, Math.floor(participantCount / 2)));
  const maxPrePriorityBonusTotal =
    maxPairCount *
    2n *
    BigInt(PRIORITY_UNMATCHED_STREAK_THRESHOLD - 1) *
    BigInt(PRE_PRIORITY_UNMATCHED_STREAK_BONUS) *
    SCORE_SCALE;
  // First-cycle boosts live in the compatibility tier, so they must be
  // bounded here too — otherwise their accumulation could overflow into the
  // matchedUser tier and make the algorithm drop a pair to chase boosts.
  const maxNewUserBonusTotal =
    maxPairCount * 2n * BigInt(NEW_OPT_IN_FIRST_CYCLE_BONUS) * SCORE_SCALE;
  const maxCompatibilityTotal =
    maxPairCount *
      toCompatibilityInteger(
        Math.max(1, Math.ceil(scoreBounds.max), NORMALIZED_SCORE_MAX),
      ) +
    maxPrePriorityBonusTotal +
    maxNewUserBonusTotal;
  const matchedUser = maxCompatibilityTotal + 1n;
  const maxMatchedUserTotal = maxPairCount * 2n * matchedUser;
  // Each tier outweighs every lower-tier contribution across the pool.
  const educationUser = maxMatchedUserTotal + maxCompatibilityTotal + 1n;
  const maxEducationUserTotal = maxPairCount * 2n * educationUser;
  const priorityUser =
    maxEducationUserTotal + maxMatchedUserTotal + maxCompatibilityTotal + 1n;
  const maxPriorityUserTotal = maxPairCount * 2n * priorityUser;
  const vipUser =
    maxPriorityUserTotal +
    maxEducationUserTotal +
    maxMatchedUserTotal +
    maxCompatibilityTotal +
    1n;
  return {
    educationUser,
    priorityUser,
    vipUser,
    matchedUser,
  };
}

export function calculateRetentionMatchingWeight(input: {
  rawScore: number;
  leftUnmatchedStreak: number;
  rightUnmatchedStreak: number;
  leftIsVip: boolean;
  rightIsVip: boolean;
  leftIsEducation: boolean;
  rightIsEducation: boolean;
  leftIsFirstCycle: boolean;
  rightIsFirstCycle: boolean;
  tiers: RetentionWeightTiers;
}) {
  const priorityUserCount =
    (input.leftUnmatchedStreak >= PRIORITY_UNMATCHED_STREAK_THRESHOLD ? 1 : 0) +
    (input.rightUnmatchedStreak >= PRIORITY_UNMATCHED_STREAK_THRESHOLD ? 1 : 0);
  const vipUserCount = (input.leftIsVip ? 1 : 0) + (input.rightIsVip ? 1 : 0);
  const regularStreakTotal =
    toRegularStreak(input.leftUnmatchedStreak) +
    toRegularStreak(input.rightUnmatchedStreak);
  const newOptInCount =
    (input.leftIsFirstCycle ? 1 : 0) + (input.rightIsFirstCycle ? 1 : 0);

  return (
    BigInt(priorityUserCount) * input.tiers.priorityUser +
    BigInt(vipUserCount) * input.tiers.vipUser +
    BigInt((input.leftIsEducation ? 1 : 0) + (input.rightIsEducation ? 1 : 0)) *
      input.tiers.educationUser +
    2n * input.tiers.matchedUser +
    BigInt(regularStreakTotal * PRE_PRIORITY_UNMATCHED_STREAK_BONUS) *
      SCORE_SCALE +
    BigInt(newOptInCount * NEW_OPT_IN_FIRST_CYCLE_BONUS) * SCORE_SCALE +
    toCompatibilityInteger(input.rawScore)
  );
}

function toCompatibilityInteger(score: number): bigint {
  const scaled = Math.round(score * COMPATIBILITY_SCORE_SCALE);
  if (score < 0 || !Number.isSafeInteger(scaled)) {
    throw new BadRequestException(
      'Matching compatibility score exceeds safe precision.',
    );
  }
  return BigInt(scaled);
}

function toRegularStreak(unmatchedStreak: number) {
  return unmatchedStreak < PRIORITY_UNMATCHED_STREAK_THRESHOLD
    ? unmatchedStreak
    : 0;
}
