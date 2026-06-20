import { Injectable } from '@nestjs/common';
import {
  estimateMatchBand,
  normalizeExcludedPartnerPreferences,
  type HardMatchGender,
  type MatchEstimateResult,
  type SchoolGenderCount,
} from '@lilink/shared';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  HARD_MATCH_KEYS,
  tryReadHardMatchAnswers,
} from '../questionnaire/hard-match';

/**
 * Mirrors cycles.service: only ACTIVE, non-test users opted in with a usable
 * weekly intent form the live candidate pool that matching actually draws from.
 * `isTest: false` keeps demo/seed accounts from inflating the pool a real user
 * is estimated against, matching the matcher's own exclusion.
 */
const ACTIVE_OPTED_IN_PARTICIPATION_FILTER: Prisma.CycleParticipationWhereInput =
  {
    status: 'OPTED_IN',
    intent: { not: null },
    user: { status: 'ACTIVE', isTest: false },
  };

/**
 * The cycle the user is currently being (or about to be) matched in — the same
 * notion of "current cycle" the dashboard uses.
 */
const CURRENT_CYCLE_STATUSES: Prisma.MatchCycleWhereInput['status'] = {
  in: ['OPEN', 'PREPARING', 'REVEAL_READY'],
};

export type MatchEstimateInput = {
  excludedPartnerSchools?: unknown;
  excludedPartnerSchoolGenders?: unknown;
};

type CandidateBucket = Pick<SchoolGenderCount, 'schoolId' | 'gender'>;

type CandidatePoolAggregate = {
  counts: SchoolGenderCount[];
  bucketByUserId: Map<string, CandidateBucket>;
};

type CandidatePoolCacheEntry = {
  loadedAt: number;
  promise: Promise<CandidatePoolAggregate>;
};

const MATCH_ESTIMATE_AGGREGATE_MAX_AGE_MS = 30_000;

@Injectable()
export class MatchEstimateService {
  private readonly aggregateByCycleId = new Map<
    string,
    CandidatePoolCacheEntry
  >();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Estimate the coarse match-odds band for the user's current partner-school /
   * partner-gender exclusions, against the live opted-in candidate pool. The
   * client only receives availability, a band, and a low-confidence flag — raw
   * pool counts never leave the server.
   */
  async estimate(
    userId: string,
    input: MatchEstimateInput,
  ): Promise<MatchEstimateResult> {
    const exclusions = normalizeExcludedPartnerPreferences({
      excludedPartnerSchools: input.excludedPartnerSchools,
      excludedPartnerSchoolGenders: input.excludedPartnerSchoolGenders,
    });

    const cycle = await this.prisma.matchCycle.findFirst({
      where: { status: CURRENT_CYCLE_STATUSES },
      orderBy: { revealAt: 'asc' },
      select: { id: true },
    });

    if (!cycle) {
      return { available: false };
    }

    const aggregate = await this.getCandidatePoolAggregate(cycle.id);
    const result = estimateMatchBand(
      this.countsExcludingRequester(aggregate, userId),
      exclusions,
    );

    return {
      available: true,
      ...result,
    };
  }

  invalidatePrecomputedCycle(cycleId?: string) {
    if (cycleId) {
      this.aggregateByCycleId.delete(cycleId);
      return;
    }

    this.aggregateByCycleId.clear();
  }

  private getCandidatePoolAggregate(cycleId: string) {
    const now = Date.now();
    const cached = this.aggregateByCycleId.get(cycleId);
    if (
      cached &&
      now - cached.loadedAt <= MATCH_ESTIMATE_AGGREGATE_MAX_AGE_MS
    ) {
      return cached.promise;
    }

    const promise = this.loadCandidatePoolAggregate(cycleId).catch((error) => {
      if (this.aggregateByCycleId.get(cycleId)?.promise === promise) {
        this.aggregateByCycleId.delete(cycleId);
      }
      throw error;
    });
    this.aggregateByCycleId.set(cycleId, { loadedAt: now, promise });
    return promise;
  }

  /**
   * Precompute the current cycle's eligible candidate matrix once per cycle.
   * The aggregate stores total (school, gender) counts plus each eligible user's
   * bucket, so each estimate can subtract the requester without re-reading the
   * whole pool.
   */
  private async loadCandidatePoolAggregate(
    cycleId: string,
  ): Promise<CandidatePoolAggregate> {
    const participations = await this.prisma.cycleParticipation.findMany({
      where: {
        cycleId,
        ...ACTIVE_OPTED_IN_PARTICIPATION_FILTER,
      },
      select: {
        user: {
          select: {
            id: true,
            school: { select: { id: true } },
            questionnaireResponse: {
              select: { answers: true, submittedAt: true },
            },
          },
        },
      },
    });

    const countsBySchool = new Map<string, Map<HardMatchGender, number>>();
    const bucketByUserId = new Map<string, CandidateBucket>();
    for (const { user } of participations) {
      const questionnaire = user.questionnaireResponse;
      if (!questionnaire || questionnaire.submittedAt == null) {
        continue;
      }

      const schoolId = user.school?.id ?? '';
      const hardMatchAnswers = tryReadHardMatchAnswers({
        ...((questionnaire.answers ?? {}) as Record<string, unknown>),
        [HARD_MATCH_KEYS.school]: schoolId,
      });
      if (!hardMatchAnswers) {
        continue;
      }

      bucketByUserId.set(user.id, {
        schoolId: hardMatchAnswers.school,
        gender: hardMatchAnswers.gender,
      });
      const gendersForSchool =
        countsBySchool.get(hardMatchAnswers.school) ??
        new Map<HardMatchGender, number>();
      gendersForSchool.set(
        hardMatchAnswers.gender,
        (gendersForSchool.get(hardMatchAnswers.gender) ?? 0) + 1,
      );
      countsBySchool.set(hardMatchAnswers.school, gendersForSchool);
    }

    const counts: SchoolGenderCount[] = [];
    for (const [schoolId, gendersForSchool] of countsBySchool) {
      for (const [gender, count] of gendersForSchool) {
        counts.push({ schoolId, gender, count });
      }
    }

    return { counts, bucketByUserId };
  }

  private countsExcludingRequester(
    aggregate: CandidatePoolAggregate,
    userId: string,
  ): SchoolGenderCount[] {
    const requesterBucket = aggregate.bucketByUserId.get(userId);
    if (!requesterBucket) {
      return aggregate.counts;
    }

    const counts: SchoolGenderCount[] = [];
    for (const entry of aggregate.counts) {
      const count =
        entry.schoolId === requesterBucket.schoolId &&
        entry.gender === requesterBucket.gender
          ? entry.count - 1
          : entry.count;

      if (count > 0) {
        counts.push({ ...entry, count });
      }
    }

    return counts;
  }
}
