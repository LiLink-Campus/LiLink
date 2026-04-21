import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type DashboardSnapshotLimitedReason as DashboardSnapshotLimitedReasonValue,
  type DashboardSnapshotResult as DashboardSnapshotResultValue,
  type DashboardSnapshotVisibility as DashboardSnapshotVisibilityValue,
  type ParticipationStatus,
  type ReportStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { readQuestionnaireOneLiner } from '../../modules/questionnaire/hard-match';
import {
  DashboardHistoryVisibility,
  type DashboardMatchResponseDto,
} from '../../modules/account/dto';

const dashboardSnapshotCycleSelect = {
  id: true,
  codename: true,
  revealAt: true,
  status: true,
} satisfies Prisma.MatchCycleSelect;

const dashboardSnapshotMatchSelect = {
  id: true,
  cycleId: true,
  score: true,
  reasons: true,
  introducedAt: true,
  cycle: {
    select: {
      id: true,
      codename: true,
      revealAt: true,
    },
  },
  reports: {
    select: {
      reporterId: true,
      status: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  },
  participants: {
    select: {
      userId: true,
      contactRequestedAt: true,
      user: {
        select: {
          email: true,
          displayName: true,
          profile: {
            select: {
              headline: true,
            },
          },
          school: {
            select: {
              name: true,
            },
          },
          questionnaireResponse: {
            select: {
              answers: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.MatchSelect;

type SnapshotStoreClient = Pick<
  PrismaService,
  'block' | 'cycleParticipation' | 'match' | 'matchCycle' | 'matchParticipant' | 'userCycleDashboardSnapshot'
>;

type SnapshotCycle = Prisma.MatchCycleGetPayload<{
  select: typeof dashboardSnapshotCycleSelect;
}>;

type SnapshotParticipation = Prisma.CycleParticipationGetPayload<{
  select: {
    userId: true;
    status: true;
  };
}>;

type SnapshotMatch = Prisma.MatchGetPayload<{
  select: typeof dashboardSnapshotMatchSelect;
}>;

type SnapshotBlock = Prisma.BlockGetPayload<{
  select: {
    blockerId: true;
    blockedId: true;
  };
}>;

type SnapshotPayload = {
  userId: string;
  cycleId: string;
  cycleRevealAt: Date;
  cycleCodename: string;
  participationStatus: ParticipationStatus;
  result: DashboardSnapshotResultValue;
  visibility: DashboardSnapshotVisibilityValue;
  limitedReason: DashboardSnapshotLimitedReasonValue | null;
  matchId: string | null;
  matchPayload: Prisma.InputJsonValue | typeof Prisma.DbNull;
};

function createPairKey(firstUserId: string, secondUserId: string) {
  return [firstUserId, secondUserId].sort().join('::');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class DashboardSnapshotService {
  private readonly inFlightCycleSyncs = new Map<string, Promise<void>>();
  private readonly inFlightMatchSyncs = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaService) {}

  async ensureUserSnapshotCoverage(input: {
    userId: string;
    latestParticipationCycleId?: string | null;
    recentRevealedCycleIds?: string[];
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
      return;
    }

    const existingSnapshots = await this.prisma.userCycleDashboardSnapshot.findMany(
      {
        where: {
          userId: input.userId,
          cycleId: {
            in: candidateCycleIds,
          },
        },
        select: {
          cycleId: true,
        },
      },
    );
    const existingSnapshotCycleIds = new Set(
      existingSnapshots.map((snapshot) => snapshot.cycleId),
    );
    const missingCycleIds = candidateCycleIds.filter(
      (cycleId) => !existingSnapshotCycleIds.has(cycleId),
    );

    if (missingCycleIds.length === 0) {
      return;
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

    for (const cycleId of cycleIdsToSync) {
      await this.syncCycleSnapshots(cycleId);
    }
  }

  async syncCycleSnapshots(cycleId: string, store?: SnapshotStoreClient) {
    if (store) {
      await this.syncCycleSnapshotsDirect(cycleId, store);
      return;
    }

    const existingSync = this.inFlightCycleSyncs.get(cycleId);
    if (existingSync) {
      await existingSync;
      return;
    }

    const pendingSync = this.syncCycleSnapshotsDirect(cycleId, this.prisma)
      .catch((error) => {
        throw error;
      })
      .finally(() => {
        this.inFlightCycleSyncs.delete(cycleId);
      });
    this.inFlightCycleSyncs.set(cycleId, pendingSync);

    await pendingSync;
  }

  async syncMatchSnapshots(matchId: string, store?: SnapshotStoreClient) {
    if (store) {
      await this.syncMatchSnapshotsDirect(matchId, store);
      return;
    }

    const existingSync = this.inFlightMatchSyncs.get(matchId);
    if (existingSync) {
      await existingSync;
      return;
    }

    const pendingSync = this.syncMatchSnapshotsDirect(matchId, this.prisma)
      .catch((error) => {
        throw error;
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

  private async syncCycleSnapshotsDirect(
    cycleId: string,
    store: SnapshotStoreClient,
  ) {
    const cycle = await store.matchCycle.findUnique({
      where: { id: cycleId },
      select: dashboardSnapshotCycleSelect,
    });

    if (!cycle || cycle.status !== 'REVEALED') {
      return;
    }

    const participations = await store.cycleParticipation.findMany({
      where: { cycleId },
      select: {
        userId: true,
        status: true,
      },
    });

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

    const snapshots = this.buildSnapshotsForCycle({
      cycle,
      participations,
      matches,
      blocks,
    });

    for (const snapshot of snapshots) {
      await store.userCycleDashboardSnapshot.create({
        data: snapshot,
      });
    }
  }

  private async syncMatchSnapshotsDirect(
    matchId: string,
    store: SnapshotStoreClient,
  ) {
    const match = await store.match.findUnique({
      where: { id: matchId },
      select: dashboardSnapshotMatchSelect,
    });

    if (!match) {
      return;
    }

    const userIds = match.participants.map((participant) => participant.userId);
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
      participations.map((participation) => [participation.userId, participation]),
    );
    const blockedPairKeys = this.buildBlockedPairKeySet(blocks);

    for (const userId of userIds) {
      const participation = participationByUserId.get(userId);
      if (!participation) {
        continue;
      }

      const snapshot = this.buildSnapshotPayload({
        userId,
        cycle: match.cycle,
        participationStatus: participation.status,
        match,
        blockedPairKeys,
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

  private buildSnapshotsForCycle(input: {
    cycle: Pick<SnapshotCycle, 'id' | 'codename' | 'revealAt'>;
    participations: SnapshotParticipation[];
    matches: SnapshotMatch[];
    blocks: SnapshotBlock[];
  }) {
    const blockedPairKeys = this.buildBlockedPairKeySet(input.blocks);
    const matchByUserId = new Map<string, SnapshotMatch>();

    for (const match of input.matches) {
      for (const participant of match.participants) {
        matchByUserId.set(participant.userId, match);
      }
    }

    return input.participations.map((participation) =>
      this.buildSnapshotPayload({
        userId: participation.userId,
        cycle: input.cycle,
        participationStatus: participation.status,
        match: matchByUserId.get(participation.userId) ?? null,
        blockedPairKeys,
      }),
    );
  }

  private buildBlockedPairKeySet(blocks: SnapshotBlock[]) {
    return new Set(
      blocks.map((block) => createPairKey(block.blockerId, block.blockedId)),
    );
  }

  private buildSnapshotPayload(input: {
    userId: string;
    cycle: {
      id: string;
      codename: string;
      revealAt: Date;
    };
    participationStatus: ParticipationStatus;
    match: SnapshotMatch | null;
    blockedPairKeys: Set<string>;
  }): SnapshotPayload {
    if (!input.match) {
      return {
        userId: input.userId,
        cycleId: input.cycle.id,
        cycleRevealAt: input.cycle.revealAt,
        cycleCodename: input.cycle.codename,
        participationStatus: input.participationStatus,
        result:
          input.participationStatus === 'OPTED_IN'
            ? 'UNMATCHED'
            : 'NOT_PARTICIPATED',
        visibility: 'NOT_APPLICABLE',
        limitedReason: null,
        matchId: null,
        matchPayload: Prisma.DbNull,
      };
    }

    const counterpart = this.findCounterpartParticipant(
      input.match.participants,
      input.userId,
    );
    const reportStatus = this.readLatestReportStatus(
      input.match.reports,
      input.userId,
    );
    const limitedReason = reportStatus
      ? 'REPORTED'
      : counterpart &&
          input.blockedPairKeys.has(createPairKey(input.userId, counterpart.userId))
        ? 'BLOCKED'
        : null;
    const visibility =
      limitedReason == null
        ? DashboardHistoryVisibility.VISIBLE
        : DashboardHistoryVisibility.LIMITED;
    const matchPayload = this.buildMatchPayload({
      match: input.match,
      currentUserId: input.userId,
      hideSensitiveFields: visibility === DashboardHistoryVisibility.LIMITED,
      reportStatus,
    });

    return {
      userId: input.userId,
      cycleId: input.cycle.id,
      cycleRevealAt: input.cycle.revealAt,
      cycleCodename: input.cycle.codename,
      participationStatus: input.participationStatus,
      result: 'MATCHED',
      visibility,
      limitedReason,
      matchId: input.match.id,
      matchPayload: matchPayload as unknown as Prisma.InputJsonValue,
    };
  }

  private buildMatchPayload(input: {
    match: SnapshotMatch;
    currentUserId: string;
    hideSensitiveFields: boolean;
    reportStatus: ReportStatus | null;
  }): DashboardMatchResponseDto {
    const currentUserParticipant =
      input.match.participants.find(
        (participant) => participant.userId === input.currentUserId,
      ) ?? null;

    return {
      id: input.match.id,
      score: input.match.score,
      reasons: input.hideSensitiveFields
        ? []
        : this.normalizeMatchReasons(input.match.reasons),
      introducedAt: this.toIsoString(input.match.introducedAt),
      currentUserRequestedAt: this.toIsoString(
        currentUserParticipant?.contactRequestedAt,
      ),
      reportStatus: input.reportStatus,
      participants: input.hideSensitiveFields
        ? []
        : input.match.participants.map((participant) => ({
            userId: participant.userId,
            displayName: participant.user.displayName,
            introLine: this.displayIntroLine(
              participant.user.questionnaireResponse?.answers,
              participant.user.profile?.headline,
            ),
            email: input.match.introducedAt ? participant.user.email : null,
            schoolName: participant.user.school?.name ?? null,
            contactRequestedAt: this.toIsoString(participant.contactRequestedAt),
          })),
    };
  }

  private findCounterpartParticipant(
    participants: SnapshotMatch['participants'],
    userId: string,
  ) {
    return participants.find((participant) => participant.userId !== userId) ?? null;
  }

  private readLatestReportStatus(
    reports: SnapshotMatch['reports'],
    userId: string,
  ): ReportStatus | null {
    return reports.find((report) => report.reporterId === userId)?.status ?? null;
  }

  private normalizeMatchReasons(rawReasons: Prisma.JsonValue): string[] {
    if (!Array.isArray(rawReasons)) {
      return [];
    }

    return rawReasons.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
  }

  private displayIntroLine(
    answers: Prisma.JsonValue | null | undefined,
    profileHeadline: string | null | undefined,
  ) {
    const fromQuestionnaire = readQuestionnaireOneLiner(answers);
    if (fromQuestionnaire) {
      return fromQuestionnaire;
    }

    const trimmedHeadline = profileHeadline?.trim();
    return trimmedHeadline ? trimmedHeadline : null;
  }

  private toIsoString(value: Date | null | undefined) {
    return value ? value.toISOString() : null;
  }

  readDashboardMatchPayload(rawPayload: Prisma.JsonValue | null | undefined) {
    if (!isRecord(rawPayload)) {
      return null;
    }

    return rawPayload as unknown as DashboardMatchResponseDto;
  }
}
