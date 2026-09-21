import { Injectable } from '@nestjs/common';
import { emptyGenderBuckets, genderKey } from '../../common/analytics/gender';
import { publicQuestionnaireGenderJoin } from '../../common/analytics/public-questionnaire-gender';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type CommunityStats = {
  total: number;
  genders: ReturnType<typeof emptyGenderBuckets>;
  schools: { id: string | null; name: string; count: number }[];
  generatedAt: string;
};

@Injectable()
export class CommunityStatsService {
  private cached: { expiresAt: number; value: CommunityStats } | null = null;
  private epoch = 0;
  private pending: Promise<CommunityStats> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  invalidateSchoolCache() {
    this.epoch += 1;
    this.cached = null;
    this.pending = null;
  }

  getStats(): Promise<CommunityStats> {
    if (this.cached && this.cached.expiresAt > Date.now())
      return Promise.resolve(this.cached.value);
    if (this.pending) return this.pending;
    const epoch = this.epoch;
    this.pending = this.load(epoch).finally(() => {
      if (epoch === this.epoch) this.pending = null;
    });
    return this.pending;
  }

  private async load(epoch: number): Promise<CommunityStats> {
    // Aggregate in the database; no individual profile or contact data leaves it.
    const rows = await this.prisma.$queryRaw<
      {
        schoolId: string | null;
        schoolName: string | null;
        gender: string | null;
        count: number;
      }[]
    >(Prisma.sql`
      SELECT u."schoolId", s."name" AS "schoolName",
        public_gender.gender, COUNT(*)::int AS "count"
      FROM "User" u
      LEFT JOIN "School" s ON s."id" = u."schoolId"
      ${publicQuestionnaireGenderJoin}
      WHERE u."status" = 'ACTIVE' AND u."deactivatedAt" IS NULL AND u."isTest" = false
      GROUP BY 1, 2, 3
    `);
    const genders = emptyGenderBuckets();
    const eligibleSchools = await this.prisma.school.findMany({
      where: { registrationEligible: true },
      select: { id: true, name: true },
    });
    const schools = new Map<string | null, CommunityStats['schools'][number]>(
      eligibleSchools.map((school) => [school.id, { ...school, count: 0 }]),
    );
    let total = 0;
    for (const row of rows) {
      const count = Number(row.count);
      total += count;
      genders[genderKey(row.gender)] += count;
      const school = schools.get(row.schoolId) ?? {
        id: row.schoolId,
        name: row.schoolName ?? '未关联学校',
        count: 0,
      };
      school.count += count;
      schools.set(row.schoolId, school);
    }
    const value = {
      total,
      genders,
      schools: [...schools.values()].sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'),
      ),
      generatedAt: new Date().toISOString(),
    };
    if (epoch === this.epoch)
      this.cached = { value, expiresAt: Date.now() + 10_000 };
    return value;
  }
}
