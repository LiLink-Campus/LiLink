import { type WeeklyIntent } from '@lilink/shared';
import {
  dashboardSnapshotCycleSelect,
  dashboardSnapshotMatchSelect,
  type SnapshotStoreClient,
} from './dashboard-snapshot.types';
import {
  buildSnapshotsForCycle,
  findCounterpartParticipant,
  buildIntentByUserId,
  buildSnapshotPayload,
  buildBlockedPairKeySet,
} from './dashboard-snapshot.payload';

export class DashboardSnapshotWriter {
  async syncCycleSnapshotsDirect(cycleId: string, store: SnapshotStoreClient) {
    const cycle = await store.matchCycle.findUnique({
      where: { id: cycleId },
      select: dashboardSnapshotCycleSelect,
    });

    if (!cycle) {
      return;
    }

    if (cycle.status !== 'REVEALED') {
      await store.userCycleDashboardSnapshot.deleteMany({
        where: { cycleId },
      });
      return;
    }

    const participations = await store.cycleParticipation.findMany({
      where: { cycleId },
      select: {
        userId: true,
        status: true,
        intent: true,
      },
    });

    // Serialize sensitive reads and writes with account deletion and reports.
    await store.$queryRaw`
      SELECT "id" FROM "Match"
      WHERE "cycleId" = ${cycleId}
      ORDER BY "id" FOR UPDATE
    `;

    await store.userCycleDashboardSnapshot.deleteMany({
      where: { cycleId },
    });

    if (participations.length === 0) {
      return;
    }

    const userIds = participations.map((participation) => participation.userId);
    const [matches, blocks] = await Promise.all([
      store.match.findMany({
        where: { cycleId },
        select: dashboardSnapshotMatchSelect,
      }),
      store.block.findMany({
        where: {
          blockerId: { in: userIds },
          blockedId: { in: userIds },
        },
        select: {
          blockerId: true,
          blockedId: true,
        },
      }),
    ]);

    const snapshots = buildSnapshotsForCycle({
      cycle,
      participations,
      matches,
      blocks,
    });

    if (snapshots.length > 0) {
      await store.userCycleDashboardSnapshot.createMany({
        data: snapshots,
        skipDuplicates: true,
      });
    }
  }

  async syncUserCycleSnapshotDirect(
    input: { userId: string; cycleId: string; onlyIfMissing?: boolean },
    store: SnapshotStoreClient,
  ) {
    const cycle = await store.matchCycle.findUnique({
      where: { id: input.cycleId },
      select: dashboardSnapshotCycleSelect,
    });

    if (!cycle) {
      return;
    }

    if (cycle.status !== 'REVEALED') {
      await store.userCycleDashboardSnapshot.deleteMany({
        where: {
          userId: input.userId,
          cycleId: input.cycleId,
        },
      });
      return;
    }

    const participation = await store.cycleParticipation.findUnique({
      where: {
        cycleId_userId: {
          userId: input.userId,
          cycleId: input.cycleId,
        },
      },
      select: {
        userId: true,
        status: true,
      },
    });

    if (!participation) {
      await store.userCycleDashboardSnapshot.deleteMany({
        where: {
          userId: input.userId,
          cycleId: input.cycleId,
        },
      });
      return;
    }

    await store.$queryRaw`
      SELECT m."id" FROM "Match" m
      JOIN "MatchParticipant" p ON p."matchId" = m."id"
      WHERE m."cycleId" = ${input.cycleId} AND p."userId" = ${input.userId}
      ORDER BY m."id" FOR UPDATE OF m
    `;
    const match = await store.match.findFirst({
      where: {
        cycleId: input.cycleId,
        participants: {
          some: { userId: input.userId },
        },
      },
      select: dashboardSnapshotMatchSelect,
    });
    const counterpart = match
      ? findCounterpartParticipant(match.participants, input.userId)
      : null;
    const blocks = counterpart
      ? await store.block.findMany({
          where: {
            OR: [
              {
                blockerId: input.userId,
                blockedId: counterpart.userId,
              },
              {
                blockerId: counterpart.userId,
                blockedId: input.userId,
              },
            ],
          },
          select: {
            blockerId: true,
            blockedId: true,
          },
        })
      : [];
    const matchParticipantIds = match
      ? match.participants.map((participant) => participant.userId)
      : [];
    const intentByUserId =
      matchParticipantIds.length > 0
        ? buildIntentByUserId(
            await store.cycleParticipation.findMany({
              where: {
                cycleId: input.cycleId,
                userId: { in: matchParticipantIds },
              },
              select: { userId: true, intent: true },
            }),
          )
        : new Map<string, WeeklyIntent | null>();
    const snapshot = buildSnapshotPayload({
      userId: input.userId,
      cycle,
      participationStatus: participation.status,
      match,
      blockedPairKeys: buildBlockedPairKeySet(blocks),
      intentByUserId,
    });

    if (input.onlyIfMissing) {
      await store.userCycleDashboardSnapshot.createMany({
        data: [snapshot],
        skipDuplicates: true,
      });
      return;
    }

    await store.userCycleDashboardSnapshot.upsert({
      where: {
        userId_cycleId: {
          userId: input.userId,
          cycleId: input.cycleId,
        },
      },
      update: snapshot,
      create: snapshot,
    });
  }

  async syncMatchSnapshotsDirect(matchId: string, store: SnapshotStoreClient) {
    await store.$queryRaw`
      SELECT "id" FROM "Match" WHERE "id" = ${matchId} FOR UPDATE
    `;
    const match = await store.match.findUnique({
      where: { id: matchId },
      select: dashboardSnapshotMatchSelect,
    });

    if (!match) {
      return;
    }

    const userIds = match.participants.map((participant) => participant.userId);
    if (match.revealedAt == null) {
      await store.userCycleDashboardSnapshot.deleteMany({
        where: {
          cycleId: match.cycleId,
          userId: {
            in: userIds,
          },
        },
      });
      return;
    }

    const [participations, blocks] = await Promise.all([
      store.cycleParticipation.findMany({
        where: {
          cycleId: match.cycleId,
          userId: {
            in: userIds,
          },
        },
        select: {
          userId: true,
          status: true,
          intent: true,
        },
      }),
      store.block.findMany({
        where: {
          blockerId: { in: userIds },
          blockedId: { in: userIds },
        },
        select: {
          blockerId: true,
          blockedId: true,
        },
      }),
    ]);
    const participationByUserId = new Map(
      participations.map((participation) => [
        participation.userId,
        participation,
      ]),
    );
    const intentByUserId = buildIntentByUserId(participations);
    const blockedPairKeys = buildBlockedPairKeySet(blocks);

    for (const userId of userIds) {
      const participation = participationByUserId.get(userId);
      if (!participation) {
        continue;
      }

      const snapshot = buildSnapshotPayload({
        userId,
        cycle: match.cycle,
        participationStatus: participation.status,
        match,
        blockedPairKeys,
        intentByUserId,
      });

      await store.userCycleDashboardSnapshot.upsert({
        where: {
          userId_cycleId: {
            userId,
            cycleId: match.cycleId,
          },
        },
        update: snapshot,
        create: snapshot,
      });
    }
  }
}
