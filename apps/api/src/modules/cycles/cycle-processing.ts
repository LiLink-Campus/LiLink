import { Prisma } from '../../common/prisma/client';
export const PREPARATION_RECOVERY_THRESHOLD_MS = 10 * 60 * 1000;

export const AUTOMATION_IDLE_RECHECK_MS = 6 * 60 * 60 * 1000;

export const AUTOMATION_PREPARING_RECHECK_MS = 60 * 1000;

export const ACTIVE_OPTED_IN_PARTICIPATION_FILTER: Prisma.CycleParticipationWhereInput =
  {
    status: 'OPTED_IN',
    intent: { not: null },
    user: { status: 'ACTIVE', isTest: false, deactivatedAt: null },
  };

export const CYCLE_PROCESSING_INCLUDE = {
  participations: {
    where: ACTIVE_OPTED_IN_PARTICIPATION_FILTER,
    select: {
      intent: true,
      user: {
        select: {
          id: true,
          displayName: true,
          vipActivations: { select: { expiresAt: true, revokedAt: true } },
          questionnaireResponse: {
            select: {
              versionId: true,
              draftAnswers: true,
              answers: true,
              submittedAt: true,
            },
          },
          school: { select: { id: true } },
        },
      },
    },
  },
} satisfies Prisma.MatchCycleInclude;

export type RunRevealCycleOptions = {
  force?: boolean;
  cycleId?: string;
  adminActorId?: string;
};

export type CyclePreparationResult = {
  ok: true;
  cycleId: string;
  state: 'PREPARED' | 'PENDING' | 'SKIPPED';
  message: string;
  createdMatches: number;
  unmatchedCount: number;
};

export type CycleRevealResult = {
  ok: true;
  cycleId: string;
  state: 'REVEALED' | 'SKIPPED';
  message: string;
  createdMatches: number;
};

export class PreparationClaimLostError extends Error {
  constructor() {
    super('Cycle state changed before preparation finished.');
  }
}

export function buildInsufficientParticipantsMessage(
  optedInCount: number,
  eligibleCount: number,
): string {
  const prefix = 'Not enough complete participants to generate matches.';
  if (optedInCount === 0) {
    return `${prefix} No users are opted in with a weekly intent (FRIEND/DATE/BOTH) for this cycle. At least 2 opted-in users with valid hard-matching questionnaire answers and a weekly intent are required.`;
  }
  if (eligibleCount === 0) {
    return `${prefix} ${optedInCount} user(s) opted in (with a weekly intent), but none have valid hard-matching questionnaire answers (birth date, partner age range, gender / partner genders, looks / partner looks, height / partner height range, and a recognized school).`;
  }
  return `${prefix} Only ${eligibleCount} of ${optedInCount} opted-in user(s) are eligible; at least 2 are required.`;
}
