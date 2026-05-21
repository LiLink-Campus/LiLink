import {
  HARD_MATCH_KEYS,
  bandForRetentionRatio,
  countRemainingCandidates,
  estimateMatchBand,
  type MatchEstimateExclusions,
  type SchoolGenderCount,
} from '@lilink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MatchEstimateService } from './match-estimate.service';

const NO_EXCLUSIONS: MatchEstimateExclusions = {
  excludedPartnerSchools: [],
  excludedPartnerSchoolGenders: [],
};

function counts(
  entries: Array<[string, SchoolGenderCount['gender'], number]>,
): SchoolGenderCount[] {
  return entries.map(([schoolId, gender, count]) => ({
    schoolId,
    gender,
    count,
  }));
}

describe('match-estimate heuristic (shared)', () => {
  it('treats an empty pool as the lowest band with low confidence', () => {
    expect(estimateMatchBand([], NO_EXCLUSIONS)).toEqual({
      band: 'VERY_LOW',
      lowConfidence: true,
    });
  });

  it('returns HIGH when nothing is excluded from a healthy pool', () => {
    const pool = counts([
      ['bupt', '男', 6],
      ['cuc', '女', 6],
    ]);
    expect(estimateMatchBand(pool, NO_EXCLUSIONS)).toEqual({
      band: 'HIGH',
      lowConfidence: false,
    });
  });

  it('flags low confidence when the base pool is small', () => {
    const pool = counts([['bupt', '男', 7]]);
    expect(estimateMatchBand(pool, NO_EXCLUSIONS)).toEqual({
      band: 'HIGH',
      lowConfidence: true,
    });
  });

  it('drops the band as a larger share of the pool is excluded', () => {
    // base 20 lets us land exactly on the ratio thresholds.
    expect(bandForRetentionRatio(12, 20).band).toBe('HIGH'); // 0.60
    expect(bandForRetentionRatio(11, 20).band).toBe('MEDIUM'); // 0.55
    expect(bandForRetentionRatio(7, 20).band).toBe('MEDIUM'); // 0.35
    expect(bandForRetentionRatio(6, 20).band).toBe('LOW'); // 0.30
    expect(bandForRetentionRatio(3, 20).band).toBe('LOW'); // 0.15
    expect(bandForRetentionRatio(2, 20).band).toBe('VERY_LOW'); // 0.10
  });

  it('excludes an entire school across all genders', () => {
    const pool = counts([
      ['bupt', '男', 8],
      ['bupt', '女', 4],
      ['cuc', '女', 8],
    ]);
    const exclusions: MatchEstimateExclusions = {
      excludedPartnerSchools: ['bupt'],
      excludedPartnerSchoolGenders: [],
    };
    // remaining = 8 (cuc/女) out of 20 -> ratio 0.4 -> MEDIUM
    expect(countRemainingCandidates(pool, exclusions)).toBe(8);
    expect(estimateMatchBand(pool, exclusions).band).toBe('MEDIUM');
  });

  it('excludes only the named gender within a school', () => {
    const pool = counts([
      ['bupt', '男', 5],
      ['bupt', '女', 5],
      ['cuc', '女', 10],
    ]);
    const exclusions: MatchEstimateExclusions = {
      excludedPartnerSchools: [],
      excludedPartnerSchoolGenders: [{ schoolId: 'bupt', genders: ['男'] }],
    };
    // remaining = 5 + 10 = 15 out of 20 -> ratio 0.75 -> HIGH
    expect(countRemainingCandidates(pool, exclusions)).toBe(15);
    expect(estimateMatchBand(pool, exclusions).band).toBe('HIGH');
  });

  it('lets a full-school exclusion supersede a gender exclusion for the same school', () => {
    const pool = counts([
      ['bupt', '男', 3],
      ['bupt', '女', 2],
    ]);
    const exclusions: MatchEstimateExclusions = {
      excludedPartnerSchools: ['bupt'],
      excludedPartnerSchoolGenders: [{ schoolId: 'bupt', genders: ['男'] }],
    };
    expect(countRemainingCandidates(pool, exclusions)).toBe(0);
    expect(estimateMatchBand(pool, exclusions)).toEqual({
      band: 'VERY_LOW',
      lowConfidence: true,
    });
  });
});

type MockPrisma = {
  matchCycle: { findFirst: jest.Mock };
  cycleParticipation: { findMany: jest.Mock };
};

function buildValidAnswers(
  gender: SchoolGenderCount['gender'],
): Record<string, unknown> {
  return {
    [HARD_MATCH_KEYS.birthDate]: '2000-01-01',
    [HARD_MATCH_KEYS.partnerAgeMin]: 18,
    [HARD_MATCH_KEYS.partnerAgeMax]: 40,
    [HARD_MATCH_KEYS.gender]: gender,
    [HARD_MATCH_KEYS.partnerGenders]: ['男', '女', '非二元'],
    [HARD_MATCH_KEYS.looks]: '普通人',
    [HARD_MATCH_KEYS.partnerLooks]: ['普通人', '小帅/美', '顶帅/美'],
    [HARD_MATCH_KEYS.heightCm]: 170,
    [HARD_MATCH_KEYS.partnerHeightMin]: 150,
    [HARD_MATCH_KEYS.partnerHeightMax]: 200,
    [HARD_MATCH_KEYS.oneLinerIntro]: '一句话介绍',
  };
}

function participant(
  schoolId: string | null,
  gender: SchoolGenderCount['gender'],
  options: { submitted?: boolean; answers?: Record<string, unknown> } = {},
) {
  const submitted = options.submitted ?? true;
  return {
    user: {
      school: schoolId ? { id: schoolId } : null,
      questionnaireResponse: {
        answers: options.answers ?? buildValidAnswers(gender),
        submittedAt: submitted ? new Date('2026-05-01T00:00:00.000Z') : null,
      },
    },
  };
}

describe('MatchEstimateService', () => {
  function createService(prisma: MockPrisma) {
    return new MatchEstimateService(prisma as unknown as PrismaService);
  }

  it('returns the lowest band with low confidence when there is no live cycle', async () => {
    const prisma: MockPrisma = {
      matchCycle: { findFirst: jest.fn().mockResolvedValue(null) },
      cycleParticipation: { findMany: jest.fn() },
    };
    const service = createService(prisma);

    await expect(service.estimate('me', {})).resolves.toEqual({
      band: 'VERY_LOW',
      lowConfidence: true,
    });
    expect(prisma.cycleParticipation.findMany).not.toHaveBeenCalled();
  });

  it('counts the current cycle pool by school+gender and excludes the requester', async () => {
    const prisma: MockPrisma = {
      matchCycle: { findFirst: jest.fn().mockResolvedValue({ id: 'cycle-1' }) },
      cycleParticipation: {
        findMany: jest.fn().mockResolvedValue([
          participant('bupt', '男'),
          participant('bupt', '男'),
          participant('cuc', '女'),
          participant('cuc', '女'),
          // Ignored: unsubmitted questionnaire and unparseable answers.
          participant('bupt', '男', { submitted: false }),
          participant('bupt', '男', { answers: { junk: true } }),
        ]),
      },
    };
    const service = createService(prisma);

    // base 4 (2 bupt/男 + 2 cuc/女); exclude bupt fully -> remaining 2 -> 0.5 -> MEDIUM
    await expect(
      service.estimate('me', { excludedPartnerSchools: ['bupt'] }),
    ).resolves.toEqual({ band: 'MEDIUM', lowConfidence: true });

    expect(prisma.cycleParticipation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cycleId: 'cycle-1',
          userId: { not: 'me' },
          status: 'OPTED_IN',
          intent: { not: null },
          user: { status: 'ACTIVE' },
        },
      }),
    );
  });

  it('uses the User.school relation, not the stored hard_school answer', async () => {
    const answersWithWrongSchool = {
      ...buildValidAnswers('男'),
      [HARD_MATCH_KEYS.school]: 'stale-school',
    };
    const prisma: MockPrisma = {
      matchCycle: { findFirst: jest.fn().mockResolvedValue({ id: 'cycle-1' }) },
      cycleParticipation: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            participant('bupt', '男', { answers: answersWithWrongSchool }),
            participant('bupt', '男', { answers: answersWithWrongSchool }),
          ]),
      },
    };
    const service = createService(prisma);

    // Excluding the relation school 'bupt' must zero out the pool even though
    // the answers carry a different (stale) hard_school value.
    await expect(
      service.estimate('me', { excludedPartnerSchools: ['bupt'] }),
    ).resolves.toEqual({ band: 'VERY_LOW', lowConfidence: true });
  });
});
