import {
  adminReportListSelect,
  MATCHABLE_CYCLE_PARTICIPATION_WHERE,
} from './admin-read-projections';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const [
      schools,
      recentCycles,
      openReports,
      openReportCount,
      activeUsers,
      completedQuestionnaires,
    ] = await Promise.all([
      this.prisma.school.count(),
      this.prisma.matchCycle.findMany({
        include: {
          _count: {
            select: {
              participations: {
                where: MATCHABLE_CYCLE_PARTICIPATION_WHERE,
              },
              matches: true,
            },
          },
        },
        orderBy: { revealAt: 'desc' },
        take: 6,
      }),
      this.prisma.report.findMany({
        where: { status: 'OPEN' },
        select: adminReportListSelect,
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.report.count({
        where: { status: 'OPEN' },
      }),
      this.prisma.user.count({
        where: { status: 'ACTIVE', deactivatedAt: null },
      }),
      this.prisma.questionnaireResponse.count({
        where: {
          submittedAt: { not: null },
          user: { deactivatedAt: null },
        },
      }),
    ]);

    return {
      metrics: {
        schools,
        activeUsers,
        completedQuestionnaires,
        openReports: openReportCount,
      },
      recentCycles,
      openReports,
    };
  }
}
