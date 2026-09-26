import { Injectable } from '@nestjs/common';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import {
  Prisma,
  type UserCycleDashboardSnapshot,
} from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getDashboardCouponAgenda } from '../coupon/coupon-read-state';
import { readDashboardCycles } from './dashboard-cycles';
import {
  DashboardHistoryItemResponseDto,
  DashboardHistoryLimitedReason,
  DashboardHistoryResult,
  DashboardHistoryVisibility,
  DashboardResponseDto,
} from './dto';
const DASHBOARD_HISTORY_LIMIT = 3;
type DashboardCycleSummary = Prisma.MatchCycleGetPayload<{
  select: {
    id: true;
    codename: true;
    revealAt: true;
  };
}>;
type DashboardSnapshotRecord = UserCycleDashboardSnapshot;
type DashboardSnapshotStore = {
  findMany: (
    args: Prisma.UserCycleDashboardSnapshotFindManyArgs,
  ) => Promise<DashboardSnapshotRecord[]>;
};
@Injectable()
export class AccountDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardSnapshotService: DashboardSnapshotService,
  ) {}
  async getDashboard(userId: string): Promise<DashboardResponseDto> {
    const snapshotStore = (
      this.prisma as PrismaService & {
        userCycleDashboardSnapshot?: DashboardSnapshotStore;
      }
    ).userCycleDashboardSnapshot;
    const [profile, questionnaire, cycleRows, couponAgenda] = await Promise.all(
      [
        this.prisma.userProfile.findUnique({
          where: { userId },
        }),
        this.prisma.questionnaireResponse.findFirst({
          where: { userId, version: { isCurrent: true } },
          select: { submittedAt: true },
        }),
        readDashboardCycles(this.prisma, userId, DASHBOARD_HISTORY_LIMIT),
        getDashboardCouponAgenda(this.prisma, userId),
      ],
    );
    const cycle = cycleRows.find((row) => row.kind === 'CURRENT') ?? null;
    const revealedCycles = cycleRows.filter((row) => row.kind === 'RECENT');
    const lastParticipationRow = cycleRows.find(
      (row) => row.kind === 'LAST_PARTICIPATION',
    );
    const lastRevealedParticipation = lastParticipationRow
      ? {
          cycleId: lastParticipationRow.id,
          status: lastParticipationRow.participationStatus!,
          cycle: lastParticipationRow,
        }
      : null;

    const revealedCycleIds = revealedCycles.map((item) => item.id);
    const latestSnapshotCandidateCycleIds = Array.from(
      new Set(
        [
          ...revealedCycleIds,
          ...(lastRevealedParticipation?.cycleId
            ? [lastRevealedParticipation.cycleId]
            : []),
        ].filter(Boolean),
      ),
    );
    const readSnapshots = () =>
      latestSnapshotCandidateCycleIds.length === 0 || !snapshotStore
        ? Promise.resolve<DashboardSnapshotRecord[]>([])
        : snapshotStore.findMany({
            where: {
              userId,
              cycleId: { in: latestSnapshotCandidateCycleIds },
            },
            orderBy: { cycleRevealAt: 'desc' },
          });
    const existingSnapshots = await readSnapshots();
    let recentSnapshots = existingSnapshots;
    const participatedRecentCycleIds = revealedCycles
      .filter((row) => row.participationStatus !== null)
      .map((row) => row.id);
    const expectedSnapshotCycleIds = [
      ...participatedRecentCycleIds,
      ...(lastRevealedParticipation ? [lastRevealedParticipation.cycleId] : []),
    ];
    const existingSnapshotCycleIds = new Set(
      existingSnapshots.map((snapshot) => snapshot.cycleId),
    );
    if (
      expectedSnapshotCycleIds.some((id) => !existingSnapshotCycleIds.has(id))
    ) {
      const repaired =
        await this.dashboardSnapshotService.ensureUserSnapshotCoverage({
          userId,
          latestParticipationCycleId:
            lastRevealedParticipation?.cycleId ?? null,
          recentRevealedCycleIds: participatedRecentCycleIds,
          existingSnapshotCycleIds: existingSnapshots.map(
            (snapshot) => snapshot.cycleId,
          ),
        });
      if (repaired) recentSnapshots = await readSnapshots();
    }
    const latestSnapshot = recentSnapshots[0] ?? null;
    const recentSnapshotByCycleId = new Map(
      recentSnapshots.map((snapshot) => [snapshot.cycleId, snapshot]),
    );
    const recentMatchHistory = revealedCycles.map((revealedCycle) => {
      const snapshot = recentSnapshotByCycleId.get(revealedCycle.id);
      return snapshot
        ? this.buildDashboardHistoryItemFromSnapshot(snapshot)
        : this.buildDefaultDashboardHistoryItem(revealedCycle);
    });
    const latestMatch = this.readLatestDashboardMatch(latestSnapshot);

    let lastRevealedRound: {
      cycleId: string;
      codename: string;
      revealAt: string;
      participationStatus: 'OPTED_IN' | 'OPTED_OUT';
      matched: boolean;
    } | null = null;

    if (latestSnapshot) {
      lastRevealedRound = {
        cycleId: latestSnapshot.cycleId,
        codename: latestSnapshot.cycleCodename,
        revealAt: latestSnapshot.cycleRevealAt.toISOString(),
        participationStatus: latestSnapshot.participationStatus,
        matched: latestMatch != null,
      };
    } else if (lastRevealedParticipation) {
      lastRevealedRound = {
        cycleId: lastRevealedParticipation.cycle.id,
        codename: lastRevealedParticipation.cycle.codename,
        revealAt: lastRevealedParticipation.cycle.revealAt.toISOString(),
        participationStatus: lastRevealedParticipation.status,
        matched: false,
      };
    }

    const latestMatchVisibility =
      latestMatch != null
        ? this.toDashboardHistoryVisibility(latestSnapshot?.visibility)
        : null;
    const latestMatchLimitedReason =
      latestMatch != null
        ? this.toDashboardHistoryLimitedReason(latestSnapshot?.limitedReason)
        : null;
    return {
      profile,
      questionnaireSubmittedAt: this.toIsoString(questionnaire?.submittedAt),
      currentCycle: cycle
        ? {
            id: cycle.id,
            codename: cycle.codename,
            revealAt: cycle.revealAt.toISOString(),
            participationDeadline: cycle.participationDeadline.toISOString(),
            status: cycle.status,
            participationStatus: cycle.participationStatus ?? 'OPTED_OUT',
            intent: cycle.intent,
          }
        : null,
      latestMatch,
      latestMatchVisibility,
      latestMatchLimitedReason,
      lastRevealedRound,
      recentMatchHistory,
      couponAgenda,
    };
  }
  private buildDefaultDashboardHistoryItem(
    cycle: DashboardCycleSummary,
  ): DashboardHistoryItemResponseDto {
    return {
      cycleId: cycle.id,
      codename: cycle.codename,
      revealAt: cycle.revealAt.toISOString(),
      participationStatus: 'OPTED_OUT',
      result: DashboardHistoryResult.NOT_PARTICIPATED,
      visibility: DashboardHistoryVisibility.NOT_APPLICABLE,
      limitedReason: null,
      match: null,
    };
  }
  private buildDashboardHistoryItemFromSnapshot(
    snapshot: DashboardSnapshotRecord,
  ): DashboardHistoryItemResponseDto {
    const match = this.readLatestDashboardMatch(snapshot);
    return {
      cycleId: snapshot.cycleId,
      codename: snapshot.cycleCodename,
      revealAt: snapshot.cycleRevealAt.toISOString(),
      participationStatus: snapshot.participationStatus,
      result: match
        ? DashboardHistoryResult.MATCHED
        : snapshot.participationStatus === 'OPTED_IN'
          ? DashboardHistoryResult.UNMATCHED
          : DashboardHistoryResult.NOT_PARTICIPATED,
      visibility: match
        ? (this.toDashboardHistoryVisibility(snapshot.visibility) ??
          DashboardHistoryVisibility.NOT_APPLICABLE)
        : DashboardHistoryVisibility.NOT_APPLICABLE,
      limitedReason: match
        ? this.toDashboardHistoryLimitedReason(snapshot.limitedReason)
        : null,
      match,
    };
  }
  private readLatestDashboardMatch(snapshot: DashboardSnapshotRecord | null) {
    if (!snapshot || snapshot.result !== 'MATCHED') {
      return null;
    }

    return this.dashboardSnapshotService.readDashboardMatchPayload(
      snapshot.matchPayload,
    );
  }
  private toDashboardHistoryVisibility(
    visibility: DashboardSnapshotRecord['visibility'] | null | undefined,
  ): DashboardHistoryVisibility | null {
    if (visibility == null) {
      return null;
    }

    switch (visibility) {
      case 'VISIBLE':
        return DashboardHistoryVisibility.VISIBLE;
      case 'LIMITED':
        return DashboardHistoryVisibility.LIMITED;
      default:
        return DashboardHistoryVisibility.NOT_APPLICABLE;
    }
  }
  private toDashboardHistoryLimitedReason(
    limitedReason: DashboardSnapshotRecord['limitedReason'] | null | undefined,
  ): DashboardHistoryLimitedReason | null {
    switch (limitedReason) {
      case 'REPORTED':
        return DashboardHistoryLimitedReason.REPORTED;
      case 'BLOCKED':
        return DashboardHistoryLimitedReason.BLOCKED;
      case 'ACCOUNT_DEACTIVATED':
        return DashboardHistoryLimitedReason.ACCOUNT_DEACTIVATED;
      default:
        return null;
    }
  }
  private toIsoString(value: Date | null | undefined): string | null {
    return value ? value.toISOString() : null;
  }
}
