import {
  adminSchoolNameSelect,
  adminUserProfileSelect,
  adminReportListSelect,
} from './admin-read-projections';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdminAuditService } from './admin-audit.service';
import {
  buildPageResult,
  normalizeAdminListPagination,
} from '../../common/pagination';
import { ADMIN_LIST_UNFILTERED_MAX } from '../../common/validation/input-limits';
import { ListReportsQueryDto } from './dto';
import { hasAdminListQuery } from './admin-list-query';

@Injectable()
export class AdminReportReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async getReports(query: ListReportsQueryDto = {}) {
    if (!hasAdminListQuery(query)) {
      return this.prisma.report.findMany({
        select: adminReportListSelect,
        orderBy: { createdAt: 'desc' },
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
              { reason: { contains: search, mode: 'insensitive' as const } },
              { details: { contains: search, mode: 'insensitive' as const } },
              {
                reporter: {
                  email: { contains: search, mode: 'insensitive' as const },
                },
              },
              {
                reportedUser: {
                  email: { contains: search, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        select: adminReportListSelect,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.report.count({ where }),
    ]);

    return buildPageResult(items, total, pagination);
  }

  async getReportContext(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        reporterId: true,
        reportedUserId: true,
        matchId: true,
        reason: true,
        details: true,
        status: true,
        adminNotes: true,
        handledAt: true,
        createdBlock: true,
        createdAt: true,
        reporter: {
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
        reportedUser: {
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
            reportsReceived: {
              select: {
                ...adminReportListSelect,
                reporter: {
                  select: {
                    email: true,
                    displayName: true,
                    school: {
                      select: adminSchoolNameSelect,
                    },
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            reportsFiled: {
              select: {
                ...adminReportListSelect,
                reportedUser: {
                  select: {
                    email: true,
                    displayName: true,
                    school: {
                      select: adminSchoolNameSelect,
                    },
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        },
        match: {
          select: {
            id: true,
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
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Report was not found.');
    }

    const [
      blockState,
      relatedLogs,
      receivedReportCount,
      filedReportCount,
      resolvedReportCount,
      openReportCount,
    ] = await Promise.all([
      this.prisma.block.findMany({
        where: {
          OR: [
            {
              blockerId: report.reporterId,
              blockedId: report.reportedUserId,
            },
            {
              blockerId: report.reportedUserId,
              blockedId: report.reporterId,
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.adminAuditService.getRecentAuditLogsByCondition(
        Prisma.sql`
          "metadata"->>'reportId' = ${reportId}
          OR "metadata"->>'reportedUserId' = ${report.reportedUserId}
          OR "metadata"->>'userId' = ${report.reportedUserId}
        `,
        120,
      ),
      this.prisma.report.count({
        where: {
          reportedUserId: report.reportedUserId,
        },
      }),
      this.prisma.report.count({
        where: {
          reporterId: report.reportedUserId,
        },
      }),
      this.prisma.report.count({
        where: {
          reportedUserId: report.reportedUserId,
          status: 'RESOLVED',
        },
      }),
      this.prisma.report.count({
        where: {
          reportedUserId: report.reportedUserId,
          status: 'OPEN',
        },
      }),
    ]);

    return {
      report,
      riskProfile: {
        reportedUserStatus: report.reportedUser.status,
        receivedReportCount,
        filedReportCount,
        resolvedReportCount,
        openReportCount,
        mutualBlocks: blockState,
      },
      logs: relatedLogs,
    };
  }
}
