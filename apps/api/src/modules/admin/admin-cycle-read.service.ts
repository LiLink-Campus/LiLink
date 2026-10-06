import {
  adminSchoolNameSelect,
  adminUserProfileSelect,
  adminUserListSelect,
  adminReportListSelect,
  MATCHABLE_CYCLE_PARTICIPATION_WHERE,
} from './admin-read-projections';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPageResult,
  normalizeAdminListPagination,
} from '../../common/pagination';
import { ADMIN_LIST_UNFILTERED_MAX } from '../../common/validation/input-limits';
import {
  ListCycleMatchesQueryDto,
  ListCycleParticipantsQueryDto,
  ListCyclesQueryDto,
} from './dto';
import { hasAdminListQuery } from './admin-list-query';

@Injectable()
export class AdminCycleReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getCycles(query: ListCyclesQueryDto = {}) {
    const matchableParticipationCountFilter = {
      participations: {
        where: MATCHABLE_CYCLE_PARTICIPATION_WHERE,
      },
      matches: true,
    };

    if (!hasAdminListQuery(query)) {
      return this.prisma.matchCycle.findMany({
        include: {
          _count: {
            select: matchableParticipationCountFilter,
          },
        },
        orderBy: { revealAt: 'desc' },
        take: ADMIN_LIST_UNFILTERED_MAX,
      });
    }

    const pagination = normalizeAdminListPagination(query);
    const search = query.search?.trim();
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { codename: { contains: search, mode: 'insensitive' as const } },
              { notes: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.matchCycle.findMany({
        where,
        include: {
          _count: {
            select: matchableParticipationCountFilter,
          },
        },
        orderBy: { revealAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.matchCycle.count({ where }),
    ]);

    return buildPageResult(items, total, pagination);
  }

  async getCycleDetail(cycleId: string) {
    const cycle = await this.prisma.matchCycle.findUnique({
      where: { id: cycleId },
      include: {
        _count: {
          select: {
            participations: true,
            matches: true,
          },
        },
      },
    });

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    const [
      matchableParticipantCount,
      submittedQuestionnaireCount,
      reportedMatchCount,
      pendingContactCount,
    ] = await Promise.all([
      this.prisma.cycleParticipation.count({
        where: {
          cycleId,
          ...MATCHABLE_CYCLE_PARTICIPATION_WHERE,
        },
      }),
      this.prisma.cycleParticipation.count({
        where: {
          cycleId,
          user: {
            deactivatedAt: null,
            questionnaireResponse: {
              is: {
                submittedAt: {
                  not: null,
                },
              },
            },
          },
        },
      }),
      this.prisma.match.count({
        where: {
          cycleId,
          reports: {
            some: {},
          },
        },
      }),
      this.prisma.match.count({
        where: {
          cycleId,
          introducedAt: null,
        },
      }),
    ]);

    return {
      cycle,
      summary: {
        participationCount: cycle._count.participations,
        matchableParticipantCount,
        submittedQuestionnaireCount,
        matchedPairCount: cycle._count.matches,
        reportedMatchCount,
        pendingContactCount,
      },
    };
  }

  async getCycleParticipants(
    cycleId: string,
    query: ListCycleParticipantsQueryDto = {},
  ) {
    await this.assertCycleExists(cycleId);

    const pagination = normalizeAdminListPagination(query);
    const where = {
      cycleId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.cycleParticipation.findMany({
        where,
        select: {
          id: true,
          status: true,
          intent: true,
          optedInAt: true,
          updatedAt: true,
          user: {
            select: adminUserListSelect,
          },
        },
        orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.cycleParticipation.count({ where }),
    ]);

    return buildPageResult(items, total, pagination);
  }

  async getCycleMatches(cycleId: string, query: ListCycleMatchesQueryDto = {}) {
    await this.assertCycleExists(cycleId);

    const pagination = normalizeAdminListPagination(query);
    const where = { cycleId };

    const [items, total] = await Promise.all([
      this.prisma.match.findMany({
        where,
        select: {
          id: true,
          score: true,
          revealedAt: true,
          introducedAt: true,
          participants: {
            select: {
              id: true,
              userId: true,
              position: true,
              contactRequestedAt: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  displayName: true,
                  status: true,
                  school: {
                    select: adminSchoolNameSelect,
                  },
                  profile: {
                    select: adminUserProfileSelect,
                  },
                },
              },
            },
          },
          reports: {
            select: adminReportListSelect,
            orderBy: { createdAt: 'desc' },
          },
          feedback: {
            select: {
              id: true,
              authorUserId: true,
              subjectUserId: true,
              rating: true,
              comment: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
          meetupFeedback: {
            select: {
              id: true,
              sessionId: true,
              authorUserId: true,
              subjectUserId: true,
              personalFitScore: true,
              interactionQualityScore: true,
              safetyBoundaryLevel: true,
              positiveTags: true,
              issueTags: true,
              note: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.match.count({ where }),
    ]);

    return buildPageResult(items, total, pagination);
  }

  private async assertCycleExists(cycleId: string) {
    const cycle = await this.prisma.matchCycle.findUnique({
      where: { id: cycleId },
      select: { id: true },
    });

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }
  }
}
