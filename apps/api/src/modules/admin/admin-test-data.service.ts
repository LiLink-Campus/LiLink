import { PublicService } from '../public/public.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '../../common/prisma/client';
import * as argon2 from 'argon2';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';
import { AdminAuditService } from './admin-audit.service';
import { generateSeedTestUserPassword } from './seed-test-user-password';
import {
  softBase,
  namedUsers,
  BULK_COUNT,
  buildBulkAnswers,
} from './admin-test-data-fixtures';

@Injectable()
export class AdminTestDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
    private readonly dashboardSnapshotService: DashboardSnapshotService,
    @Optional() private readonly publicService?: PublicService,
  ) {}

  private assertTestUserBulkOpsAllowed() {
    if (env.APP_ENV === 'production') {
      throw new ForbiddenException(
        'Bulk test user seed and delete are disabled in production.',
      );
    }
  }

  async setTestFlag(userId: string, isTest: boolean, adminActorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { isTest },
      });

      if (isTest) {
        await tx.productEvent.deleteMany({ where: { userId } });
        await tx.productEventOutbox.deleteMany({ where: { userId } });
      }
    });

    if (user.isTest !== isTest) this.publicService?.invalidateLandingCache();
    await this.adminAuditService.write(adminActorId, 'user.test_flag', {
      userId,
      isTest,
    });

    return { ok: true, isTest };
  }

  async deleteAllTestUsers(adminActorId: string) {
    this.assertTestUserBulkOpsAllowed();

    const testUsers = await this.prisma.user.findMany({
      where: { isTest: true },
      select: { id: true, email: true },
    });

    if (testUsers.length === 0) {
      throw new BadRequestException('No test users to delete.');
    }

    const userIds = testUsers.map((u) => u.id);

    const affectedMatchIds = (
      await this.prisma.matchParticipant.findMany({
        where: { userId: { in: userIds } },
        select: { matchId: true },
        distinct: ['matchId'],
      })
    ).map((p) => p.matchId);
    const affectedCycleIds = (
      await this.prisma.match.findMany({
        where: { id: { in: affectedMatchIds } },
        select: { cycleId: true },
        distinct: ['cycleId'],
      })
    ).map((match) => match.cycleId);
    const affectedMeetupSessions = await this.prisma.meetupSession.findMany({
      where: { matchId: { in: affectedMatchIds } },
      select: {
        id: true,
        proposals: { select: { id: true } },
      },
    });
    const affectedMeetupSessionIds = affectedMeetupSessions.map(
      (session) => session.id,
    );
    const affectedMeetupProposalIds = affectedMeetupSessions.flatMap(
      (session) => session.proposals.map((proposal) => proposal.id),
    );
    const productAnalyticsDeleteOr = this.testUserProductAnalyticsDeleteOr({
      userIds,
      matchIds: affectedMatchIds,
      meetupSessionIds: affectedMeetupSessionIds,
      meetupProposalIds: affectedMeetupProposalIds,
    });

    await this.prisma.$transaction([
      this.prisma.report.deleteMany({
        where: { matchId: { in: affectedMatchIds } },
      }),
      this.prisma.matchParticipant.deleteMany({
        where: { matchId: { in: affectedMatchIds } },
      }),
      this.prisma.match.deleteMany({ where: { id: { in: affectedMatchIds } } }),
      this.prisma.cycleParticipation.deleteMany({
        where: { userId: { in: userIds } },
      }),
      this.prisma.report.deleteMany({
        where: {
          OR: [
            { reporterId: { in: userIds } },
            { reportedUserId: { in: userIds } },
          ],
        },
      }),
      this.prisma.block.deleteMany({
        where: {
          OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }],
        },
      }),
      this.prisma.questionnaireResponse.deleteMany({
        where: { userId: { in: userIds } },
      }),
      this.prisma.userProfile.deleteMany({
        where: { userId: { in: userIds } },
      }),
      this.prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } }),
      // Merchant-promotion graph (Restrict FKs) must be cleared before the user
      // rows, in dependency order: Redemption (Restrict on Coupon) -> Coupon
      // (Restrict on User) -> CampaignActivation (Restrict on User).
      // ReferralEvent holds only weak referrer refs (no FK) but is cleared so
      // funnel stats don't count deleted users. referredByUserId is
      // ON DELETE SET NULL and referralCampaignId points at Campaign, so
      // neither needs manual unlinking.
      this.prisma.redemption.deleteMany({ where: { userId: { in: userIds } } }),
      this.prisma.coupon.deleteMany({ where: { userId: { in: userIds } } }),
      this.prisma.campaignActivation.deleteMany({
        where: { userId: { in: userIds } },
      }),
      this.prisma.referralEvent.deleteMany({
        where: { referrerUserId: { in: userIds } },
      }),
      this.prisma.productEvent.deleteMany({ where: productAnalyticsDeleteOr }),
      this.prisma.productEventOutbox.deleteMany({
        where: productAnalyticsDeleteOr,
      }),
      this.prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);

    this.publicService?.invalidateLandingCache();
    for (const cycleId of affectedCycleIds) {
      await this.dashboardSnapshotService.syncCycleSnapshots(cycleId);
    }

    await this.adminAuditService.write(adminActorId, 'users.test_deleted', {
      count: testUsers.length,
      emails: testUsers.map((u) => u.email),
    });

    return { ok: true, deletedCount: testUsers.length };
  }

  private testUserProductAnalyticsDeleteOr(input: {
    userIds: string[];
    matchIds: string[];
    meetupSessionIds: string[];
    meetupProposalIds: string[];
  }) {
    const filters: Array<{
      userId?: { in: string[] };
      entityType?: string;
      entityId?: { in: string[] };
    }> = [{ userId: { in: input.userIds } }];
    if (input.matchIds.length > 0) {
      filters.push({
        entityType: 'match',
        entityId: { in: input.matchIds },
      });
    }
    if (input.meetupSessionIds.length > 0) {
      filters.push({
        entityType: 'meetup_session',
        entityId: { in: input.meetupSessionIds },
      });
    }
    if (input.meetupProposalIds.length > 0) {
      filters.push({
        entityType: 'meetup_proposal',
        entityId: { in: input.meetupProposalIds },
      });
    }
    return { OR: filters };
  }

  async seedTestUsers(adminActorId: string) {
    this.assertTestUserBulkOpsAllowed();

    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { isCurrent: true },
    });
    if (!version) {
      throw new BadRequestException(
        'No active questionnaire version. Run seed-defaults first.',
      );
    }

    const cycle = await this.prisma.matchCycle.findFirst({
      where: { status: { in: ['OPEN', 'DRAFT'] } },
      orderBy: { revealAt: 'asc' },
    });
    if (!cycle) {
      throw new BadRequestException(
        'No open or draft cycle found. Create one first.',
      );
    }

    const schools = await this.prisma.school.findMany({
      take: 9,
      orderBy: { name: 'asc' },
      include: {
        domains: {
          orderBy: { domain: 'asc' },
          take: 1,
        },
      },
    });
    if (schools.length < 3) {
      throw new BadRequestException(
        'At least 3 schools needed. Run seed-defaults first.',
      );
    }

    const PASSWORD = generateSeedTestUserPassword();
    const passwordHash = await argon2.hash(PASSWORD);

    const schoolBySlug = new Map(schools.map((s) => [s.slug, s]));
    const schoolList = schools;
    let createdCount = 0;

    const upsertUser = async (input: {
      email: string;
      displayName: string;
      fullName: string;
      schoolId: string | null;
      answers: Record<string, unknown>;
    }) => {
      const now = new Date();
      const user = await this.prisma.user.upsert({
        where: { email: input.email },
        update: {
          passwordHash,
          status: UserStatus.ACTIVE,
          displayName: input.displayName,
          schoolId: input.schoolId,
          isTest: true,
          acceptedTermsAt: now,
          lastActiveAt: now,
        },
        create: {
          email: input.email,
          passwordHash,
          status: UserStatus.ACTIVE,
          displayName: input.displayName,
          schoolId: input.schoolId,
          isTest: true,
          acceptedTermsAt: now,
          lastActiveAt: now,
        },
      });

      await this.prisma.userProfile.upsert({
        where: { userId: user.id },
        update: { fullName: input.fullName },
        create: { userId: user.id, fullName: input.fullName },
      });

      await this.prisma.questionnaireResponse.upsert({
        where: { userId: user.id },
        update: {
          versionId: version.id,
          answers: input.answers as Prisma.InputJsonValue,
          submittedAt: new Date(),
        },
        create: {
          userId: user.id,
          versionId: version.id,
          answers: input.answers as Prisma.InputJsonValue,
          submittedAt: new Date(),
        },
      });

      // Synthetic test users default to BOTH so the test pool always has a
      // bridge intent and matching can run end-to-end without manual UI clicks.
      await this.prisma.cycleParticipation.upsert({
        where: { cycleId_userId: { cycleId: cycle.id, userId: user.id } },
        update: {
          status: 'OPTED_IN',
          intent: 'BOTH',
          optedInAt: new Date(),
        },
        create: {
          cycleId: cycle.id,
          userId: user.id,
          status: 'OPTED_IN',
          intent: 'BOTH',
          optedInAt: new Date(),
        },
      });

      createdCount++;
    };

    for (const named of namedUsers) {
      const school = schoolBySlug.get(named.schoolSlug);
      await upsertUser({
        email: named.email,
        displayName: named.displayName,
        fullName: named.fullName,
        schoolId: school?.id ?? null,
        answers: { ...softBase, ...named.hard },
      });
    }

    for (let i = 0; i < BULK_COUNT; i++) {
      const school = schoolList[i % schoolList.length];
      const domain = school.domains[0]?.domain ?? 'test.edu.cn';
      const n = String(i + 1).padStart(2, '0');
      await upsertUser({
        email: `seed.bulk.${n}@${domain}`,
        displayName: `批量-${n}`,
        fullName: `Seed Bulk User ${i + 1}`,
        schoolId: school.id,
        answers: buildBulkAnswers(i),
      });
    }

    this.publicService?.invalidateLandingCache();
    await this.adminAuditService.write(adminActorId, 'users.test_seeded', {
      count: createdCount,
      cycleId: cycle.id,
    });

    return {
      ok: true,
      createdCount,
      cycleId: cycle.id,
      cycleName: cycle.codename,
      password: PASSWORD,
    };
  }
}
