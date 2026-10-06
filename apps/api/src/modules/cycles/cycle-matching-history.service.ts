import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CycleMatchingHistoryService {
  constructor(private readonly prisma: PrismaService) {}
  createPairKey(firstUserId: string, secondUserId: string) {
    return [firstUserId, secondUserId].sort().join('::');
  }

  private buildHistoricalPairKeySet(
    matches: Array<{ participants: Array<{ userId: string }> }>,
  ) {
    return new Set(
      matches
        .map((match) => {
          const ids = match.participants.map(
            (participant) => participant.userId,
          );

          if (ids.length !== 2) {
            return null;
          }

          return this.createPairKey(ids[0], ids[1]);
        })
        .filter((value): value is string => Boolean(value)),
    );
  }

  loadHistoricalPairKeys(participantIds: string[], currentCycleId?: string) {
    return this.prisma.match
      .findMany({
        where: {
          participants: {
            some: { userId: { in: participantIds } },
          },
          ...(currentCycleId ? { cycleId: { not: currentCycleId } } : {}),
        },
        select: {
          participants: {
            select: {
              userId: true,
            },
          },
        },
      })
      .then((matches) => this.buildHistoricalPairKeySet(matches));
  }

  async loadUnmatchedStreaks(
    participantIds: string[],
    beforeRevealAt: Date,
    currentCycleId?: string,
  ) {
    if (participantIds.length === 0) {
      return new Map<string, number>();
    }

    const participations = await this.prisma.cycleParticipation.findMany({
      where: {
        userId: { in: participantIds },
        status: 'OPTED_IN',
        intent: { not: null },
        ...(currentCycleId ? { cycleId: { not: currentCycleId } } : {}),
        cycle: {
          status: 'REVEALED',
          revealAt: { lt: beforeRevealAt },
        },
      },
      select: {
        userId: true,
        cycleId: true,
        updatedAt: true,
        cycle: {
          select: {
            revealAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: [
        { userId: 'asc' },
        { cycle: { revealAt: 'desc' } },
        { cycle: { createdAt: 'desc' } },
        { updatedAt: 'desc' },
      ],
    });
    const cycleIds = Array.from(
      new Set(participations.map((participation) => participation.cycleId)),
    );
    const matchedParticipations =
      cycleIds.length === 0
        ? []
        : await this.prisma.matchParticipant.findMany({
            where: {
              userId: { in: participantIds },
              cycleId: { in: cycleIds },
            },
            select: {
              userId: true,
              cycleId: true,
            },
          });
    const matchedParticipationKeys = new Set(
      matchedParticipations.map(
        (participant) => `${participant.userId}::${participant.cycleId}`,
      ),
    );
    const participationsByUserId = new Map<string, typeof participations>();

    for (const participation of participations) {
      const userParticipations =
        participationsByUserId.get(participation.userId) ?? [];
      userParticipations.push(participation);
      participationsByUserId.set(participation.userId, userParticipations);
    }

    return new Map(
      participantIds.map((participantId) => {
        const userParticipations =
          participationsByUserId.get(participantId) ?? [];
        let streak = 0;

        for (const participation of userParticipations) {
          const participationKey = `${participation.userId}::${participation.cycleId}`;
          if (matchedParticipationKeys.has(participationKey)) {
            break;
          }

          streak += 1;
        }

        return [participantId, streak];
      }),
    );
  }

  async loadFirstCycleParticipantIds(
    participantIds: string[],
    beforeRevealAt: Date,
    currentCycleId?: string,
  ): Promise<Set<string>> {
    if (participantIds.length === 0) {
      return new Set<string>();
    }

    const priorParticipations = await this.prisma.cycleParticipation.findMany({
      where: {
        userId: { in: participantIds },
        status: 'OPTED_IN',
        intent: { not: null },
        ...(currentCycleId ? { cycleId: { not: currentCycleId } } : {}),
        cycle: {
          status: 'REVEALED',
          revealAt: { lt: beforeRevealAt },
        },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    const returningUserIds = new Set(
      priorParticipations.map((participation) => participation.userId),
    );

    return new Set(participantIds.filter((id) => !returningUserIds.has(id)));
  }
}
