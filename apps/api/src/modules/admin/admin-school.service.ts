import { normalizeSchoolEmailDomains } from '@lilink/shared';
import { CommunityStatsService } from '../public/community-stats.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '../../common/prisma/client';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { syncSchoolQuestionnaireResponses } from './school-questionnaire-sync';
import { CreateSchoolDto, ListSchoolsQueryDto, UpdateSchoolDto } from './dto';
import { AdminAuditService } from './admin-audit.service';
import { SchoolResolverService } from '../../common/schools/school-resolver.service';
import { lockSchoolCatalog } from '../../common/schools/school-catalog';
import { PublicService } from '../public/public.service';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import {
  buildPageResult,
  normalizeAdminListPagination,
} from '../../common/pagination';

type DashboardSnapshotPort = Pick<
  DashboardSnapshotService,
  'syncMatchSnapshots'
>;

type SchoolResolverPort = Pick<
  SchoolResolverService,
  'invalidateResolutionCache'
>;

type EligibleSchoolsCachePort = Pick<
  PublicService,
  'invalidateEligibleSchoolsCache'
>;

type CurrentQuestionnaireCachePort = Pick<
  QuestionnaireService,
  'invalidateCurrentQuestionnaireCache'
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

const defaultEligibleSchoolsCachePort: EligibleSchoolsCachePort = {
  invalidateEligibleSchoolsCache() {
    return;
  },
};

const defaultCurrentQuestionnaireCachePort: CurrentQuestionnaireCachePort = {
  invalidateCurrentQuestionnaireCache() {
    return;
  },
};

@Injectable()
export class AdminSchoolService {
  private readonly dashboardSnapshotService: DashboardSnapshotPort;
  private readonly schoolResolverService: SchoolResolverPort;
  private readonly publicService: EligibleSchoolsCachePort;
  private readonly questionnaireService: CurrentQuestionnaireCachePort;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
    @Optional() dashboardSnapshotService?: DashboardSnapshotService,
    @Optional() schoolResolverService?: SchoolResolverService,
    @Optional() publicService?: PublicService,
    @Optional() questionnaireService?: QuestionnaireService,
    @Optional() private readonly communityStatsService?: CommunityStatsService,
  ) {
    this.dashboardSnapshotService =
      dashboardSnapshotService ?? defaultDashboardSnapshotPort;
    this.schoolResolverService =
      schoolResolverService ?? defaultSchoolResolverPort;
    this.publicService = publicService ?? defaultEligibleSchoolsCachePort;
    this.questionnaireService =
      questionnaireService ?? defaultCurrentQuestionnaireCachePort;
  }

  // Invalidate school-derived caches so changes are reflected by the resolver
  // (school-email detection), the public list + manual-school dropdown, and the
  // current-questionnaire snapshot (its payload embeds the full school list).
  private invalidateSchoolCaches() {
    this.communityStatsService?.invalidateSchoolCache();
    this.schoolResolverService.invalidateResolutionCache();
    this.publicService.invalidateEligibleSchoolsCache();
    this.questionnaireService.invalidateCurrentQuestionnaireCache();
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
              users: { where: { deactivatedAt: null } },
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
              users: { where: { deactivatedAt: null } },
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

    const school = await this.prisma.$transaction(async (tx) => {
      await lockSchoolCatalog(tx, 'write');
      return tx.school.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          registrationEligible: true,
          domains: {
            create: normalizedDomains.map((domain) => ({ domain })),
          },
        },
        include: {
          domains: true,
        },
      });
    });

    this.invalidateSchoolCaches();
    await this.adminAuditService.write(adminActorId, 'school.created', {
      schoolId: school.id,
      slug: school.slug,
      registrationEligible: school.registrationEligible,
    });

    return school;
  }

  async update(schoolId: string, input: UpdateSchoolDto, adminActorId: string) {
    const normalizedDomains = this.normalizeDomains(input.domains);

    const updatedSchool = await this.prisma.$transaction(async (tx) => {
      await lockSchoolCatalog(tx, 'write');
      if (!(await tx.school.findUnique({ where: { id: schoolId } })))
        throw new NotFoundException('School not found.');
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
          registrationEligible: true,
          domains: {
            create: normalizedDomains.map((domain) => ({ domain })),
          },
        },
        include: { domains: true },
      });
    });

    this.invalidateSchoolCaches();
    await this.adminAuditService.write(adminActorId, 'school.updated', {
      schoolId: updatedSchool.id,
      slug: updatedSchool.slug,
      registrationEligible: updatedSchool.registrationEligible,
    });

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

    const { source, target, affectedUserIds } = await this.prisma.$transaction(
      async (tx) => {
        await lockSchoolCatalog(tx, 'write');
        const [source, target] = await Promise.all([
          tx.school.findUnique({
            where: { id: sourceSchoolId },
            include: { domains: true, _count: { select: { users: true } } },
          }),
          tx.school.findUnique({ where: { id: targetSchoolId } }),
        ]);
        if (!source) throw new NotFoundException('Source school not found.');
        if (!target) throw new NotFoundException('Target school not found.');
        const affectedUserIds = await this.loadSchoolUserIds(
          sourceSchoolId,
          tx,
        );
        const remainingSchools = await tx.school.findMany({
          where: { id: { not: sourceSchoolId } },
          select: { id: true },
          orderBy: { name: 'asc' },
        });

        await tx.user.updateMany({
          where: { schoolId: sourceSchoolId },
          data: { schoolId: targetSchoolId },
        });

        await syncSchoolQuestionnaireResponses(tx, {
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
        return { source, target, affectedUserIds };
      },
    );

    this.invalidateSchoolCaches();
    await this.adminAuditService.write(adminActorId, 'school.merged', {
      sourceSchoolId,
      sourceSchoolName: source.name,
      targetSchoolId,
      targetSchoolName: target.name,
      movedUserCount: source._count.users,
      movedDomainCount: source.domains.length,
    });

    await this.syncSnapshotsForUserIds(affectedUserIds);

    return { ok: true, movedUsers: source._count.users };
  }

  async delete(schoolId: string, adminActorId: string) {
    const { school, affectedUserIds } = await this.prisma.$transaction(
      async (tx) => {
        await lockSchoolCatalog(tx, 'write');
        const school = await tx.school.findUnique({ where: { id: schoolId } });
        if (!school) throw new NotFoundException('School not found.');
        const affectedUserIds = await this.loadSchoolUserIds(schoolId, tx);
        // Keep account -> questionnaire lock order used by profile saves.
        await tx.user.updateMany({
          where: { schoolId },
          data: { schoolId: null },
        });
        const remainingSchools = await tx.school.findMany({
          where: { id: { not: schoolId } },
          select: { id: true },
          orderBy: { name: 'asc' },
        });

        await syncSchoolQuestionnaireResponses(tx, {
          allowedSchoolIds: remainingSchools.map((item) => item.id),
          rewrittenSchoolIds: {
            [schoolId]: null,
          },
          affectedUserIds,
        });

        await tx.schoolDomain.deleteMany({ where: { schoolId } });
        await tx.school.delete({ where: { id: schoolId } });
        return { school, affectedUserIds };
      },
    );

    this.invalidateSchoolCaches();
    await this.adminAuditService.write(adminActorId, 'school.deleted', {
      schoolId,
      slug: school.slug,
    });
    await this.syncSnapshotsForUserIds(affectedUserIds);
    return { ok: true };
  }

  private hasListQuery(query: ListSchoolsQueryDto) {
    return Boolean(query.page || query.pageSize || query.search);
  }

  private normalizeDomains(rawDomains: string[]) {
    const normalizedDomains = normalizeSchoolEmailDomains(rawDomains);

    if (normalizedDomains.length === 0) {
      throw new BadRequestException(
        'At least one valid email domain is required.',
      );
    }

    return [...new Set(normalizedDomains)];
  }

  private async loadSchoolUserIds(
    schoolId: string,
    store: Pick<Prisma.TransactionClient, 'user'> = this.prisma,
  ): Promise<string[]> {
    const userStore = (
      store as Pick<Prisma.TransactionClient, 'user'> & {
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
