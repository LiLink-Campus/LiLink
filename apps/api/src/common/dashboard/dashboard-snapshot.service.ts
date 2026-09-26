import { Injectable } from '@nestjs/common';
import { Prisma } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { type SnapshotStoreClient } from './dashboard-snapshot.types';
import { DashboardSnapshotWriter } from './dashboard-snapshot.writer';
import { readDashboardMatchPayload } from './dashboard-snapshot.payload';

@Injectable()
export class DashboardSnapshotService {
  private readonly inFlightCycleSyncs = new Map<string, Promise<void>>();
  private readonly inFlightCycleRebuilds = new Map<string, Promise<void>>();
  private readonly inFlightMatchSyncs = new Map<string, Promise<void>>();
  private readonly inFlightUserCycleSyncs = new Map<string, Promise<void>>();
  private readonly inFlightCycleUserSyncs = new Map<
    string,
    Set<Promise<void>>
  >();

  private readonly writer = new DashboardSnapshotWriter();

  constructor(private readonly prisma: PrismaService) {}

  async ensureUserSnapshotCoverage(input: {
    userId: string;
    latestParticipationCycleId?: string | null;
    recentRevealedCycleIds?: string[];
    existingSnapshotCycleIds?: string[];
  }) {
    const candidateCycleIds = Array.from(
      new Set(
        [
          ...(input.recentRevealedCycleIds ?? []),
          ...(input.latestParticipationCycleId
            ? [input.latestParticipationCycleId]
            : []),
        ].filter(Boolean),
      ),
    );

    if (candidateCycleIds.length === 0) {
      return false;
    }

    const existingSnapshotCycleIds = new Set(
      input.existingSnapshotCycleIds ??
        (
          await this.prisma.userCycleDashboardSnapshot.findMany({
            where: {
              userId: input.userId,
              cycleId: {
                in: candidateCycleIds,
              },
            },
            select: {
              cycleId: true,
            },
          })
        ).map((snapshot) => snapshot.cycleId),
    );
    const missingCycleIds = candidateCycleIds.filter(
      (cycleId) => !existingSnapshotCycleIds.has(cycleId),
    );

    if (missingCycleIds.length === 0) {
      return false;
    }

    const participations = await this.prisma.cycleParticipation.findMany({
      where: {
        userId: input.userId,
        cycleId: {
          in: missingCycleIds,
        },
        cycle: {
          status: 'REVEALED',
        },
      },
      select: {
        cycleId: true,
      },
    });
    const cycleIdsToSync = Array.from(
      new Set(participations.map((participation) => participation.cycleId)),
    );

    await Promise.all(
      cycleIdsToSync.map((cycleId) =>
        this.syncUserCycleSnapshot({
          userId: input.userId,
          cycleId,
          onlyIfMissing: true,
        }),
      ),
    );
    return cycleIdsToSync.length > 0;
  }

  async syncCycleSnapshots(cycleId: string, store?: SnapshotStoreClient) {
    if (store) {
      await this.writer.syncCycleSnapshotsDirect(cycleId, store);
      return;
    }

    const existingSync = this.inFlightCycleRebuilds.get(cycleId);
    if (existingSync) {
      await existingSync;
      return;
    }

    const pendingSync = this.enqueueCycleSnapshotSync(cycleId, () =>
      this.prisma.$transaction(
        async (tx) => {
          await this.writer.syncCycleSnapshotsDirect(cycleId, tx);
        },
        { timeout: 30_000 },
      ),
    ).finally(() => {
      if (this.inFlightCycleRebuilds.get(cycleId) === pendingSync) {
        this.inFlightCycleRebuilds.delete(cycleId);
      }
    });
    this.inFlightCycleRebuilds.set(cycleId, pendingSync);

    await pendingSync;
  }

  async syncUserCycleSnapshot(
    input: { userId: string; cycleId: string; onlyIfMissing?: boolean },
    store?: SnapshotStoreClient,
  ) {
    if (store) {
      await this.writer.syncUserCycleSnapshotDirect(input, store);
      return;
    }

    const syncKey = `${input.userId}::${input.cycleId}`;
    const existingSync = this.inFlightUserCycleSyncs.get(syncKey);
    if (existingSync) {
      await existingSync;
      return;
    }

    const pendingSync = this.enqueueUserCycleSnapshotSync(
      input.cycleId,
      async () => {
        // A preceding full rebuild may already have filled this missing row.
        if (input.onlyIfMissing) {
          const existing =
            await this.prisma.userCycleDashboardSnapshot.findUnique({
              where: {
                userId_cycleId: {
                  userId: input.userId,
                  cycleId: input.cycleId,
                },
              },
              select: { userId: true },
            });
          if (existing) return;
        }
        await this.prisma.$transaction(async (tx) => {
          await this.writer.syncUserCycleSnapshotDirect(input, tx);
        });
      },
    ).finally(() => {
      this.inFlightUserCycleSyncs.delete(syncKey);
    });
    this.inFlightUserCycleSyncs.set(syncKey, pendingSync);

    await pendingSync;
  }

  private async enqueueCycleSnapshotSync(
    cycleId: string,
    operation: () => Promise<void>,
  ) {
    const previousSync = this.inFlightCycleSyncs.get(cycleId);
    const precedingUsers = [
      ...(this.inFlightCycleUserSyncs.get(cycleId) ?? []),
    ];
    const pendingSync = Promise.allSettled([
      ...(previousSync ? [previousSync] : []),
      ...precedingUsers,
    ])
      .then(operation)
      .finally(() => {
        if (this.inFlightCycleSyncs.get(cycleId) === pendingSync) {
          this.inFlightCycleSyncs.delete(cycleId);
        }
      });
    this.inFlightCycleSyncs.set(cycleId, pendingSync);

    await pendingSync;
  }

  private async enqueueUserCycleSnapshotSync(
    cycleId: string,
    operation: () => Promise<void>,
  ) {
    const precedingRebuild = this.inFlightCycleSyncs.get(cycleId);
    const users =
      this.inFlightCycleUserSyncs.get(cycleId) ?? new Set<Promise<void>>();
    this.inFlightCycleUserSyncs.set(cycleId, users);
    const pending = (precedingRebuild ?? Promise.resolve())
      .catch(() => undefined)
      .then(operation)
      .finally(() => {
        users.delete(pending);
        if (
          users.size === 0 &&
          this.inFlightCycleUserSyncs.get(cycleId) === users
        )
          this.inFlightCycleUserSyncs.delete(cycleId);
      });
    users.add(pending);
    await pending;
  }

  async syncMatchSnapshots(matchId: string, store?: SnapshotStoreClient) {
    if (store) {
      await this.writer.syncMatchSnapshotsDirect(matchId, store);
      return;
    }

    const existingSync = this.inFlightMatchSyncs.get(matchId);
    if (existingSync) {
      await existingSync;
      return;
    }

    const pendingSync = this.prisma
      .$transaction(async (tx) => {
        await this.writer.syncMatchSnapshotsDirect(matchId, tx);
      })
      .finally(() => {
        this.inFlightMatchSyncs.delete(matchId);
      });
    this.inFlightMatchSyncs.set(matchId, pendingSync);

    await pendingSync;
  }

  async syncUserMatchSnapshots(userId: string) {
    const matchParticipants = await this.prisma.matchParticipant.findMany({
      where: { userId },
      select: {
        matchId: true,
      },
    });
    const matchIds = Array.from(
      new Set(matchParticipants.map((participant) => participant.matchId)),
    );

    for (const matchId of matchIds) {
      await this.syncMatchSnapshots(matchId);
    }
  }

  async syncUserDisplayNameSnapshots(userId: string) {
    await this.prisma.$transaction(async (tx) => {
      // Match locks serialize this metadata update with rebuilds and redaction.
      await tx.$queryRaw`
        SELECT m."id" FROM "Match" m
        WHERE EXISTS (
          SELECT 1 FROM "MatchParticipant" p
          WHERE p."matchId" = m."id" AND p."userId" = ${userId}
        )
        ORDER BY m."id" FOR UPDATE OF m
      `;
      await tx.$executeRaw`
        UPDATE "UserCycleDashboardSnapshot" s
        SET "matchPayload" = jsonb_set(s."matchPayload", '{participants}', (
          SELECT jsonb_agg(
            CASE WHEN item->>'userId' = u."id"
              THEN jsonb_set(item, '{displayName}', COALESCE(to_jsonb(u."displayName"), 'null'::jsonb))
              ELSE item END ORDER BY position
          )
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(s."matchPayload"->'participants') = 'array'
              THEN s."matchPayload"->'participants' ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS participant(item, position)
        )), "updatedAt" = CURRENT_TIMESTAMP
        FROM "User" u
        WHERE u."id" = ${userId}
          AND s."matchPayload"->'participants' @> ${JSON.stringify([{ userId }])}::jsonb
          AND EXISTS (
            SELECT 1 FROM "MatchParticipant" p
            WHERE p."matchId" = s."matchId" AND p."userId" = u."id"
          )
      `;
    });
  }

  readDashboardMatchPayload(rawPayload: Prisma.JsonValue | null | undefined) {
    return readDashboardMatchPayload(rawPayload);
  }
}
