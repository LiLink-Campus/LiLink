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
 * Mirrors cycles.service: only ACTIVE users opted in with a usable weekly intent
 * form the live candidate pool that matching actually draws from.
 */
const ACTIVE_OPTED_IN_PARTICIPATION_FILTER: Prisma.CycleParticipationWhereInput =
  {
    status: 'OPTED_IN',
    intent: { not: null },
    user: { status: 'ACTIVE' },
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

@Injectable()
export class MatchEstimateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Estimate the coarse match-odds band for the user's current partner-school /
   * partner-gender exclusions, against the live opted-in candidate pool. Only
   * the band (and a low-confidence flag) is returned — raw pool counts never
   * leave the server.
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

    // No live cycle means there is no pool to estimate against, which reads as
    // the lowest band (estimateMatchBand treats an empty pool as VERY_LOW).
    const counts = cycle
      ? await this.loadCandidateCounts(cycle.id, userId)
      : [];

    return estimateMatchBand(counts, exclusions);
  }

  /**
   * Build the (school, gender) candidate-count matrix for the current cycle's
   * opted-in eligible pool, excluding the requesting user. School is taken from
   * the `User.school` relation (cycles.service injects it as the `hard_school`
   * answer before parsing); gender comes from the parsed hard-match answers.
   */
  private async loadCandidateCounts(
    cycleId: string,
    userId: string,
  ): Promise<SchoolGenderCount[]> {
    const participations = await this.prisma.cycleParticipation.findMany({
      where: {
        cycleId,
        userId: { not: userId },
        ...ACTIVE_OPTED_IN_PARTICIPATION_FILTER,
      },
      select: {
        user: {
          select: {
            school: { select: { id: true } },
            questionnaireResponse: {
              select: { answers: true, submittedAt: true },
            },
          },
        },
      },
    });

    const countsBySchool = new Map<string, Map<HardMatchGender, number>>();
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

    return counts;
  }
}
