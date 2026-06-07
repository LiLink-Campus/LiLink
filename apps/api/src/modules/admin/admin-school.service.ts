import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '../../common/prisma/client';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  syncExcludedPartnerSchoolPreferences,
  syncQuestionnaireSchoolAnswers,
} from '../questionnaire/questionnaire-school-sync';
import { CreateSchoolDto, ListSchoolsQueryDto, UpdateSchoolDto } from './dto';
import { AdminAuditService } from './admin-audit.service';
import { SchoolResolverService } from '../../common/schools/school-resolver.service';
import {
  buildPageResult,
  normalizeAdminListPagination,
} from '../../common/pagination';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type DashboardSnapshotPort = Pick<
  DashboardSnapshotService,
  'syncMatchSnapshots'
>;

type SchoolResolverPort = Pick<
  SchoolResolverService,
  'invalidateResolutionCache'
>;

const defaultDashboardSnapshotPort: DashboardSnapshotPort = {
  syncMatchSnapshots() {
    return Promise.resolve();
  },
};

const defaultSchoolResolverPort: SchoolResolverPort = {
  invalidateResolutionCache() {
    return;
  },
};

@Injectable()
export class AdminSchoolService {
  private readonly dashboardSnapshotService: DashboardSnapshotPort;
  private readonly schoolResolverService: SchoolResolverPort;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
    @Optional() dashboardSnapshotService?: DashboardSnapshotService,
    @Optional() schoolResolverService?: SchoolResolverService,
  ) {
    this.dashboardSnapshotService =
      dashboardSnapshotService ?? defaultDashboardSnapshotPort;
    this.schoolResolverService =
      schoolResolverService ?? defaultSchoolResolverPort;
  }

  async list(query: ListSchoolsQueryDto = {}) {
    if (!this.hasListQuery(query)) {
      return this.prisma.school.findMany({
        include: {
          domains: {
            orderBy: { domain: 'asc' },
          },
          _count: {
            select: {
              users: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    }

    const pagination = normalizeAdminListPagination(query);
    const search = query.search?.trim();
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { slug: { contains: search, mode: 'insensitive' as const } },
            {
              domains: {
                some: {
                  domain: { contains: search, mode: 'insensitive' as const },
                },
              },
            },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.school.findMany({
        where,
        include: {
          domains: {
            orderBy: { domain: 'asc' },
          },
          _count: {
            select: {
              users: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.school.count({ where }),
    ]);

    return buildPageResult(items, total, pagination);
  }

  async create(input: CreateSchoolDto, adminActorId: string) {
    const normalizedDomains = this.normalizeDomains(input.domains);

    const school = await this.prisma.school.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        // Omitted (undefined) falls back to the schema default (eligible).
        registrationEligible: input.registrationEligible,
        domains: {
          create: normalizedDomains.map((domain) => ({ domain })),
        },
      },
      include: {
        domains: true,
      },
    });

    await this.adminAuditService.write(adminActorId, 'school.created', {
      schoolId: school.id,
      slug: school.slug,
      registrationEligible: school.registrationEligible,
    });
    this.schoolResolverService.invalidateResolutionCache();

    return school;
  }

  async update(schoolId: string, input: UpdateSchoolDto, adminActorId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new NotFoundException('School not found.');
    }

    const normalizedDomains = this.normalizeDomains(input.domains);

    const updatedSchool = await this.prisma.$transaction(async (tx) => {
      await tx.schoolDomain.deleteMany({
        where: { schoolId },
      });

      await tx.schoolDomain.deleteMany({
        where: { domain: { in: normalizedDomains } },
      });

      return tx.school.update({
        where: { id: schoolId },
        data: {
          name: input.name,
          description: input.description,
          // Omitted (undefined) leaves the current eligibility unchanged.
          registrationEligible: input.registrationEligible,
          domains: {
            create: normalizedDomains.map((domain) => ({ domain })),
          },
        },
        include: { domains: true },
      });
    });

    await this.adminAuditService.write(adminActorId, 'school.updated', {
      schoolId: updatedSchool.id,
      slug: updatedSchool.slug,
      registrationEligible: updatedSchool.registrationEligible,
    });
    this.schoolResolverService.invalidateResolutionCache();

    await this.syncSnapshotsForSchoolUsers(updatedSchool.id);

    return updatedSchool;
  }

  async merge(
    sourceSchoolId: string,
    targetSchoolId: string,
    adminActorId: string,
  ) {
    if (sourceSchoolId === targetSchoolId) {
      throw new BadRequestException('Cannot merge a school into itself.');
    }

    const [source, target] = await Promise.all([
      this.prisma.school.findUnique({
        where: { id: sourceSchoolId },
        include: { domains: true, _count: { select: { users: true } } },
      }),
      this.prisma.school.findUnique({
        where: { id: targetSchoolId },
      }),
    ]);

    if (!source) throw new NotFoundException('Source school not found.');
    if (!target) throw new NotFoundException('Target school not found.');

    const affectedUserIds = await this.loadSchoolUserIds(sourceSchoolId);

    await this.prisma.$transaction(async (tx) => {
      const remainingSchools = await tx.school.findMany({
        where: { id: { not: sourceSchoolId } },
        select: { id: true },
        orderBy: { name: 'asc' },
      });

      await tx.user.updateMany({
        where: { schoolId: sourceSchoolId },
        data: { schoolId: targetSchoolId },
      });

      await this.syncQuestionnaireResponses(tx, {
        allowedSchoolIds: remainingSchools.map((school) => school.id),
        rewrittenSchoolIds: {
          [sourceSchoolId]: targetSchoolId,
        },
        affectedUserIds,
      });

      await tx.schoolDomain.updateMany({
        where: { schoolId: sourceSchoolId },
        data: { schoolId: targetSchoolId },
      });

      await tx.school.delete({ where: { id: sourceSchoolId } });
    });

    await this.adminAuditService.write(adminActorId, 'school.merged', {
      sourceSchoolId,
      sourceSchoolName: source.name,
      targetSchoolId,
      targetSchoolName: target.name,
      movedUserCount: source._count.users,
      movedDomainCount: source.domains.length,
    });
    this.schoolResolverService.invalidateResolutionCache();

    await this.syncSnapshotsForUserIds(affectedUserIds);

    return { ok: true, movedUsers: source._count.users };
  }

  async delete(schoolId: string, adminActorId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new NotFoundException('School not found.');
    }

    const affectedUserIds = await this.loadSchoolUserIds(schoolId);

    await this.prisma.$transaction(async (tx) => {
      const remainingSchools = await tx.school.findMany({
        where: { id: { not: schoolId } },
        select: { id: true },
        orderBy: { name: 'asc' },
      });

      await this.syncQuestionnaireResponses(tx, {
        allowedSchoolIds: remainingSchools.map((item) => item.id),
        rewrittenSchoolIds: {
          [schoolId]: null,
        },
        affectedUserIds,
      });

      await tx.schoolDomain.deleteMany({ where: { schoolId } });
      await tx.school.delete({ where: { id: schoolId } });
    });

    await this.adminAuditService.write(adminActorId, 'school.deleted', {
      schoolId,
      slug: school.slug,
    });
    this.schoolResolverService.invalidateResolutionCache();
    await this.syncSnapshotsForUserIds(affectedUserIds);
    return { ok: true };
  }

  private hasListQuery(query: ListSchoolsQueryDto) {
    return Boolean(query.page || query.pageSize || query.search);
  }

  private normalizeDomains(rawDomains: string[]) {
    const normalizedDomains = rawDomains
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean);

    if (normalizedDomains.length === 0) {
      throw new BadRequestException(
        'At least one valid email domain is required.',
      );
    }

    return [...new Set(normalizedDomains)];
  }

  private async syncQuestionnaireResponses(
    tx: Prisma.TransactionClient,
    options: {
      allowedSchoolIds: readonly string[];
      rewrittenSchoolIds?: Readonly<Record<string, string | null>>;
      affectedUserIds?: readonly string[];
    },
  ) {
    const responseIds = await this.findResponsesReferencingSchools(
      tx,
      Object.keys(options.rewrittenSchoolIds ?? {}),
      options.affectedUserIds ?? [],
    );

    if (responseIds.length === 0) {
      return;
    }

    const responses = await tx.questionnaireResponse.findMany({
      where: { id: { in: responseIds } },
      select: {
        id: true,
        answers: true,
        draftAnswers: true,
        user: {
          select: {
            schoolId: true,
          },
        },
      },
    });

    for (const response of responses) {
      const rawAnswers = response.answers as Record<string, unknown>;
      const syncedAnswers = syncQuestionnaireSchoolAnswers(rawAnswers, {
        currentSchoolId: response.user.schoolId ?? null,
        allowedSchoolIds: options.allowedSchoolIds,
        rewrittenSchoolIds: options.rewrittenSchoolIds,
      });
      const syncedDraftAnswers = this.syncQuestionnaireDraftAnswers(
        response.draftAnswers,
        options,
      );

      if (
        isDeepStrictEqual(rawAnswers, syncedAnswers) &&
        isDeepStrictEqual(response.draftAnswers, syncedDraftAnswers)
      ) {
        continue;
      }

      const data: Record<string, Prisma.InputJsonValue> = {};
      if (!isDeepStrictEqual(rawAnswers, syncedAnswers)) {
        data.answers = syncedAnswers;
      }
      if (!isDeepStrictEqual(response.draftAnswers, syncedDraftAnswers)) {
        data.draftAnswers = syncedDraftAnswers as Prisma.InputJsonValue;
      }

      await tx.questionnaireResponse.update({
        where: { id: response.id },
        data,
      });
    }
  }

  /**
   * A response can only change if its answers/draftAnswers reference one of the
   * affected school ids — either as the user's own `hard_school` value or inside
   * the partner-school exclusion lists. School ids are opaque cuids, so a
   * substring match over the serialized JSON is a strict superset of the rows
   * the rewrite below can touch (the per-row recompute still decides the actual
   * change), letting Postgres filter instead of streaming every response into
   * the app. `affectedUserIds` is unioned in because a moved user's own
   * `hard_school` is rewritten to their new school even when the old value is
   * absent from the JSON. Falls back to a full scan if no rewrite mapping is
   * supplied.
   */
  private async findResponsesReferencingSchools(
    tx: Prisma.TransactionClient,
    schoolIds: readonly string[],
    affectedUserIds: readonly string[],
  ): Promise<string[]> {
    if (schoolIds.length === 0) {
      const all = await tx.questionnaireResponse.findMany({
        select: { id: true },
      });
      return all.map((response) => response.id);
    }

    const conditions = [...new Set(schoolIds)].map(
      (schoolId) => Prisma.sql`(
        strpos("answers"::text, ${schoolId}) > 0
        OR strpos(COALESCE("draftAnswers"::text, ''), ${schoolId}) > 0
      )`,
    );

    const uniqueUserIds = [...new Set(affectedUserIds)];
    if (uniqueUserIds.length > 0) {
      conditions.push(Prisma.sql`"userId" IN (${Prisma.join(uniqueUserIds)})`);
    }

    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "QuestionnaireResponse"
      WHERE ${Prisma.join(conditions, ' OR ')}
    `);

    return rows.map((row) => row.id);
  }

  private syncQuestionnaireDraftAnswers(
    rawDraftAnswers: Prisma.JsonValue | null,
    options: {
      allowedSchoolIds: readonly string[];
      rewrittenSchoolIds?: Readonly<Record<string, string | null>>;
    },
  ) {
    if (
      !isRecord(rawDraftAnswers) ||
      !isRecord(rawDraftAnswers.hardMatchForm)
    ) {
      return rawDraftAnswers;
    }

    const hardMatchForm = rawDraftAnswers.hardMatchForm;
    const hasExcludedPartnerSchools = Object.prototype.hasOwnProperty.call(
      hardMatchForm,
      'excludedPartnerSchools',
    );
    const hasExcludedPartnerSchoolGenders =
      Object.prototype.hasOwnProperty.call(
        hardMatchForm,
        'excludedPartnerSchoolGenders',
      );
    const syncedExcludedPartnerPreferences =
      syncExcludedPartnerSchoolPreferences(
        {
          excludedPartnerSchools: hardMatchForm.excludedPartnerSchools,
          excludedPartnerSchoolGenders:
            hardMatchForm.excludedPartnerSchoolGenders,
        },
        options,
      );
    const syncedHardMatchForm: Record<string, Prisma.InputJsonValue> = {
      ...(hardMatchForm as Record<string, Prisma.InputJsonValue>),
    };

    if (
      syncedExcludedPartnerPreferences.excludedPartnerSchools.length > 0 ||
      hasExcludedPartnerSchools
    ) {
      syncedHardMatchForm.excludedPartnerSchools =
        syncedExcludedPartnerPreferences.excludedPartnerSchools;
    } else {
      delete syncedHardMatchForm.excludedPartnerSchools;
    }

    if (
      syncedExcludedPartnerPreferences.excludedPartnerSchoolGenders.length >
        0 ||
      hasExcludedPartnerSchoolGenders
    ) {
      syncedHardMatchForm.excludedPartnerSchoolGenders =
        syncedExcludedPartnerPreferences.excludedPartnerSchoolGenders;
    } else {
      delete syncedHardMatchForm.excludedPartnerSchoolGenders;
    }

    return {
      ...(rawDraftAnswers as Record<string, Prisma.InputJsonValue>),
      hardMatchForm: syncedHardMatchForm,
    };
  }

  private async loadSchoolUserIds(schoolId: string): Promise<string[]> {
    const userStore = (
      this.prisma as PrismaService & {
        user?: {
          findMany: (args: {
            where: { schoolId: string };
            select: { id: true };
          }) => Promise<Array<{ id: string }>>;
        };
      }
    ).user;

    if (!userStore) {
      return [];
    }

    const users = await userStore.findMany({
      where: { schoolId },
      select: { id: true },
    });

    return users.map((user) => user.id);
  }

  private async syncSnapshotsForSchoolUsers(schoolId: string) {
    const userIds = await this.loadSchoolUserIds(schoolId);
    await this.syncSnapshotsForUserIds(userIds);
  }

  private async syncSnapshotsForUserIds(userIds: string[]) {
    if (userIds.length === 0) {
      return;
    }

    // Rebuild each affected match's snapshots once. The previous per-user fan-out
    // re-loaded every user's matches and rebuilt shared matches (both members in
    // the affected set) twice; collecting distinct match ids up front avoids both.
    const matchParticipants = await this.prisma.matchParticipant.findMany({
      where: { userId: { in: userIds } },
      select: { matchId: true },
    });
    const matchIds = [
      ...new Set(matchParticipants.map((participant) => participant.matchId)),
    ];

    for (const matchId of matchIds) {
      await this.dashboardSnapshotService.syncMatchSnapshots(matchId);
    }
  }
}
