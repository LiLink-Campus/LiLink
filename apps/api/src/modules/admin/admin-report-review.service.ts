import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../common/prisma/client';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BatchReviewReportsDto, ReviewReportDto } from './dto';

@Injectable()
export class AdminReportReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardSnapshotService: DashboardSnapshotService,
  ) {}

  async batchReviewReports(input: BatchReviewReportsDto, adminActorId: string) {
    const reports = await this.prisma.report.findMany({
      where: {
        id: { in: input.reportIds },
      },
    });

    if (reports.length === 0) {
      throw new NotFoundException('Reports not found.');
    }

    const operations: Prisma.PrismaPromise<unknown>[] = reports.flatMap(
      (report) => {
        const reportOperations: Prisma.PrismaPromise<unknown>[] = [
          this.prisma.report.update({
            where: { id: report.id },
            data: {
              status: input.status,
              adminNotes: input.notes,
              handledAt: new Date(),
            },
          }),
        ];

        if (input.suspendUsers) {
          reportOperations.push(
            this.prisma.user.update({
              where: { id: report.reportedUserId },
              data: { status: 'SUSPENDED' },
            }),
          );
        }

        return reportOperations;
      },
    );

    operations.push(
      this.prisma.auditLog.create({
        data: {
          adminActorId,
          action: 'report.batch_reviewed',
          metadata: {
            reportIds: input.reportIds,
            status: input.status,
            suspendUsers: input.suspendUsers ?? false,
          },
        },
      }),
    );

    await this.prisma.$transaction(operations);

    const affectedMatchIds = Array.from(
      new Set(
        reports
          .map((report) => report.matchId)
          .filter((matchId): matchId is string => Boolean(matchId)),
      ),
    );
    for (const matchId of affectedMatchIds) {
      await this.dashboardSnapshotService.syncMatchSnapshots(matchId);
    }

    return {
      ok: true,
      processed: reports.length,
    };
  }

  async reviewReport(
    reportId: string,
    input: ReviewReportDto,
    adminActorId: string,
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report was not found.');
    }

    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.report.update({
        where: { id: reportId },
        data: {
          status: input.status,
          adminNotes: input.notes,
          handledAt: new Date(),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          adminActorId,
          action: 'report.reviewed',
          metadata: {
            reportId,
            status: input.status,
            suspendUser: input.suspendUser ?? false,
          },
        },
      }),
    ];

    if (input.suspendUser) {
      operations.push(
        this.prisma.user.update({
          where: { id: report.reportedUserId },
          data: { status: 'SUSPENDED' },
        }),
      );
    }

    await this.prisma.$transaction(operations);

    if (report.matchId) {
      await this.dashboardSnapshotService.syncMatchSnapshots(report.matchId);
    }

    return { ok: true };
  }
}
