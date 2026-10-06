import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CyclePreparationResult } from './cycle-processing';

@Injectable()
export class CyclePreparationStateService {
  constructor(private readonly prisma: PrismaService) {}
  async revertPreparationClaimIfEmpty(cycleId: string, claimUpdatedAt?: Date) {
    await this.prisma.matchCycle.updateMany({
      where: {
        id: cycleId,
        status: 'PREPARING',
        matches: { none: {} },
        ...(claimUpdatedAt ? { updatedAt: claimUpdatedAt } : {}),
      },
      data: {
        status: 'OPEN',
      },
    });
  }

  async finalizePreparedCycle(options: {
    cycleId: string;
    claimUpdatedAt?: Date;
    adminActorId?: string;
    force?: boolean;
    createdMatches: number;
    unmatchedCount: number;
    message: string;
  }): Promise<CyclePreparationResult> {
    const finalized = await this.prisma.$transaction(async (tx) => {
      const claimedCycle = await tx.matchCycle.updateMany({
        where: {
          id: options.cycleId,
          status: 'PREPARING',
          ...(options.claimUpdatedAt
            ? { updatedAt: options.claimUpdatedAt }
            : {}),
        },
        data: {
          status: 'REVEAL_READY',
        },
      });

      if (claimedCycle.count === 0) {
        return false;
      }

      await tx.auditLog.create({
        data: {
          adminActorId: options.adminActorId,
          action: 'cycle.prepared',
          metadata: {
            cycleId: options.cycleId,
            createdMatches: options.createdMatches,
            unmatchedCount: options.unmatchedCount,
            forced: options.force ?? false,
            message: options.message,
          },
        },
      });

      return true;
    });

    return {
      ok: true,
      cycleId: options.cycleId,
      state: 'PREPARED',
      createdMatches: options.createdMatches,
      unmatchedCount: options.unmatchedCount,
      message: finalized
        ? options.message
        : 'Cycle is already prepared and waiting for reveal.',
    };
  }
}
