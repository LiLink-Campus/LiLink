import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { cancelMatchEmails } from '../../common/mail/match-mail';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReportMatchDto } from './dto';

@Injectable()
export class MatchReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardSnapshotService: DashboardSnapshotService,
  ) {}
  async reportMatch(userId: string, matchId: string, input: ReportMatchDto) {
    const participant = await this.prisma.matchParticipant.findFirst({
      where: {
        matchId,
        userId,
      },
      include: {
        match: true,
      },
    });

    if (!participant) {
      throw new NotFoundException('Match was not found for this user.');
    }

    if (participant.match.revealedAt == null) {
      throw new BadRequestException('This match is not revealed yet.');
    }

    const counterpart = await this.prisma.matchParticipant.findFirst({
      where: {
        matchId,
        userId: {
          not: userId,
        },
      },
    });

    if (!counterpart) {
      throw new BadRequestException(
        'Counterpart was not found for this match.',
      );
    }

    const existingReport = await this.prisma.report.findFirst({
      where: {
        reporterId: userId,
        matchId,
        status: 'OPEN',
      },
    });

    if (existingReport) {
      throw new BadRequestException('This match has already been reported.');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lockMatchForReport(tx, matchId);

      const transactionExistingReport = await tx.report.findFirst({
        where: {
          reporterId: userId,
          matchId,
          status: 'OPEN',
        },
      });

      if (transactionExistingReport) {
        throw new BadRequestException('This match has already been reported.');
      }

      await tx.report.create({
        data: {
          reporterId: userId,
          reportedUserId: counterpart.userId,
          matchId,
          reason: input.reason,
          details: input.details,
          createdBlock: true,
        },
      });
      await tx.block.upsert({
        where: {
          blockerId_blockedId: {
            blockerId: userId,
            blockedId: counterpart.userId,
          },
        },
        update: {},
        create: {
          blockerId: userId,
          blockedId: counterpart.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'match.reported',
          metadata: {
            matchId,
            reportedUserId: counterpart.userId,
            reason: input.reason,
          },
        },
      });
      await cancelMatchEmails(tx, [matchId], 'Match reported before delivery.');
      await this.dashboardSnapshotService.syncMatchSnapshots(matchId, tx);
    });

    return { ok: true };
  }
  private async lockMatchForReport(
    tx: Prisma.TransactionClient,
    matchId: string,
  ) {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Match"
      WHERE "id" = ${matchId}
      FOR UPDATE
    `;
  }
}
