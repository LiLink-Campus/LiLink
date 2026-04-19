import {
  MatchCycleStatus,
  ParticipationStatus,
  Prisma,
  WeeklyIntent,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const STICKY_PARTICIPATION_CYCLE_STATUSES: MatchCycleStatus[] = [
  'OPEN',
  'REVEAL_READY',
];

const CACHE_TTL_MS = 30_000;
const processedCycleTimestamps = new Map<string, number>();

type StickyParticipationPrismaClient = Pick<
  PrismaService,
  'matchCycle' | 'cycleParticipation' | '$transaction'
>;

type StickyParticipationCycle = {
  id: string;
  revealAt: Date;
  createdAt: Date;
  status: MatchCycleStatus;
};

export function clearStickyParticipationCache() {
  processedCycleTimestamps.clear();
}

function isCacheValid(cycleId: string): boolean {
  const processedAt = processedCycleTimestamps.get(cycleId);
  if (!processedAt) return false;
  if (Date.now() - processedAt > CACHE_TTL_MS) {
    processedCycleTimestamps.delete(cycleId);
    return false;
  }
  return true;
}

function shouldInitializeStickyParticipations(status: MatchCycleStatus) {
  return STICKY_PARTICIPATION_CYCLE_STATUSES.includes(status);
}

function buildStickyParticipationCreateInput(
  cycleId: string,
  userId: string,
  status: ParticipationStatus,
  previousIntent: WeeklyIntent | null,
  initializedAt: Date,
): Prisma.CycleParticipationCreateManyInput {
  return {
    cycleId,
    userId,
    status,
    // Sticky carry-over keeps the latest stored intent for OPTED_IN users.
    // When a historical OPTED_IN row predates the feature and has no intent
    // yet, BOTH is the compatibility-preserving default.
    intent: status === 'OPTED_IN' ? (previousIntent ?? 'BOTH') : null,
    optedInAt: status === 'OPTED_IN' ? initializedAt : null,
  };
}

async function loadStickyParticipationCycle(
  prisma: StickyParticipationPrismaClient,
  cycleId: string,
) {
  return prisma.matchCycle.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      revealAt: true,
      createdAt: true,
      status: true,
    },
  });
}

async function initializeStickyParticipations(
  tx: Pick<StickyParticipationPrismaClient, 'cycleParticipation'>,
  cycle: StickyParticipationCycle,
) {
  const existingParticipations = await tx.cycleParticipation.findMany({
    where: { cycleId: cycle.id },
    select: { userId: true },
  });
  const existingUserIds = new Set(
    existingParticipations.map((participation) => participation.userId),
  );

  const previousParticipations = await tx.cycleParticipation.findMany({
    where: {
      cycleId: { not: cycle.id },
      OR: [
        {
          cycle: {
            revealAt: { lt: cycle.revealAt },
          },
        },
        {
          cycle: {
            revealAt: cycle.revealAt,
            createdAt: { lt: cycle.createdAt },
          },
        },
      ],
    },
    select: {
      userId: true,
      status: true,
      intent: true,
      updatedAt: true,
    },
    orderBy: [
      {
        cycle: {
          revealAt: 'desc',
        },
      },
      {
        cycle: {
          createdAt: 'desc',
        },
      },
      {
        updatedAt: 'desc',
      },
    ],
  });

  const initializedUserIds = new Set<string>();
  const initializedAt = new Date();
  const createData: Prisma.CycleParticipationCreateManyInput[] = [];

  for (const participation of previousParticipations) {
    if (
      existingUserIds.has(participation.userId) ||
      initializedUserIds.has(participation.userId)
    ) {
      continue;
    }

    initializedUserIds.add(participation.userId);
    createData.push(
      buildStickyParticipationCreateInput(
        cycle.id,
        participation.userId,
        participation.status,
        participation.intent,
        initializedAt,
      ),
    );
  }

  if (createData.length === 0) {
    return { createdCount: 0 };
  }

  const result = await tx.cycleParticipation.createMany({
    data: createData,
    skipDuplicates: true,
  });

  return { createdCount: result.count };
}

export async function ensureStickyCycleParticipations(
  prisma: StickyParticipationPrismaClient,
  cycleOrId: StickyParticipationCycle | string,
) {
  const cycle =
    typeof cycleOrId === 'string'
      ? await loadStickyParticipationCycle(prisma, cycleOrId)
      : cycleOrId;

  if (!cycle || !shouldInitializeStickyParticipations(cycle.status)) {
    return { createdCount: 0 };
  }

  if (isCacheValid(cycle.id)) {
    return { createdCount: 0 };
  }

  const result = await prisma.$transaction(async (tx) =>
    initializeStickyParticipations(tx, cycle),
  );

  processedCycleTimestamps.set(cycle.id, Date.now());
  return result;
}
