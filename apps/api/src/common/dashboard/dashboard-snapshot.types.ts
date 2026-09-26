import {
  Prisma,
  type ParticipationStatus,
  type DashboardSnapshotResult as DashboardSnapshotResultValue,
  type DashboardSnapshotVisibility as DashboardSnapshotVisibilityValue,
  type DashboardSnapshotLimitedReason as DashboardSnapshotLimitedReasonValue,
} from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const dashboardSnapshotCycleSelect = {
  id: true,
  codename: true,
  revealAt: true,
  status: true,
} satisfies Prisma.MatchCycleSelect;

export const dashboardSnapshotMatchSelect = {
  id: true,
  cycleId: true,
  score: true,
  revealedAt: true,
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
      introducedContactType: true,
      introducedContactValue: true,
      profileSnapshot: true,
      user: {
        select: {
          email: true,
          deactivatedAt: true,
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

export type SnapshotStoreClient = Pick<
  PrismaService,
  | 'block'
  | 'cycleParticipation'
  | 'match'
  | 'matchCycle'
  | 'matchParticipant'
  | 'userCycleDashboardSnapshot'
  | '$queryRaw'
>;

export type SnapshotCycle = Prisma.MatchCycleGetPayload<{
  select: typeof dashboardSnapshotCycleSelect;
}>;

export type SnapshotParticipation = Prisma.CycleParticipationGetPayload<{
  select: {
    userId: true;
    status: true;
    intent: true;
  };
}>;

export type SnapshotMatch = Prisma.MatchGetPayload<{
  select: typeof dashboardSnapshotMatchSelect;
}>;

export type SnapshotBlock = Prisma.BlockGetPayload<{
  select: {
    blockerId: true;
    blockedId: true;
  };
}>;

export type SnapshotPayload = {
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
