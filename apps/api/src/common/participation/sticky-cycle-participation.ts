import {
  MatchCycleStatus,
  ParticipationStatus,
  Prisma,
  WeeklyIntent,
} from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const STICKY_PARTICIPATION_CYCLE_STATUSES: MatchCycleStatus[] = [
  'OPEN',
  'PREPARING',
  'REVEAL_READY',
];

const INACTIVE_AUTO_OPT_OUT_MS = 7 * 24 * 60 * 60 * 1000;
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

type StickyParticipationInitializationResult = {
  createdCount: number;
  autoOptedOutCount: number;
};

type StickyParticipationCreateInput = {
  data: Prisma.CycleParticipationCreateManyInput;
  autoOptedOut: boolean;
};

/**
 * @internal Test hook for resetting the module-level cycle cache.
 */
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

function shouldAutoOptOutCurrentParticipations(status: MatchCycleStatus) {
  return status === 'OPEN';
}

function buildStickyParticipationCreateInput(
  cycleId: string,
  userId: string,
  status: ParticipationStatus,
  previousIntent: WeeklyIntent | null,
  hasSubmittedQuestionnaire: boolean,
  lastActiveAt: Date | null,
  initializedAt: Date,
): StickyParticipationCreateInput {
  const inactiveCutoffMs = initializedAt.getTime() - INACTIVE_AUTO_OPT_OUT_MS;
  const shouldAutoOptOut =
    status === 'OPTED_IN' &&
    (!hasSubmittedQuestionnaire ||
      !lastActiveAt ||
      lastActiveAt.getTime() <= inactiveCutoffMs);
  const nextStatus: ParticipationStatus = shouldAutoOptOut
    ? 'OPTED_OUT'
    : status;

  return {
    data: {
      cycleId,
      userId,
      status: nextStatus,
      // Sticky carry-over keeps the latest stored intent for OPTED_IN users.
      // When a historical OPTED_IN row predates the feature and has no intent
      // yet, BOTH is the compatibility-preserving default.
      intent: nextStatus === 'OPTED_IN' ? (previousIntent ?? 'BOTH') : null,
      optedInAt: nextStatus === 'OPTED_IN' ? initializedAt : null,
    },
    autoOptedOut: shouldAutoOptOut,
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

async function autoOptOutInactiveCurrentParticipations(
  tx: Pick<StickyParticipationPrismaClient, 'cycleParticipation'>,
  cycleId: string,
  initializedAt: Date,
) {
  const inactiveCutoffAt = new Date(
    initializedAt.getTime() - INACTIVE_AUTO_OPT_OUT_MS,
  );

  const result = await tx.cycleParticipation.updateMany({
    where: {
      cycleId,
      status: 'OPTED_IN',
      user: {
        OR: [
          { lastActiveAt: null },
          { lastActiveAt: { lte: inactiveCutoffAt } },
        ],
      },
    },
    data: {
      status: 'OPTED_OUT',
      intent: null,
      optedInAt: null,
    },
  });

  return result.count;
}

async function createCycleParticipations(
  tx: Pick<StickyParticipationPrismaClient, 'cycleParticipation'>,
  data: Prisma.CycleParticipationCreateManyInput[],
) {
  if (data.length === 0) {
    return 0;
  }

  const result = await tx.cycleParticipation.createMany({
    data,
    skipDuplicates: true,
  });

  return result.count;
}

async function initializeStickyParticipations(
  tx: Pick<StickyParticipationPrismaClient, 'cycleParticipation'>,
  cycle: StickyParticipationCycle,
): Promise<StickyParticipationInitializationResult> {
  const initializedAt = new Date();
  const currentAutoOptedOutCount = shouldAutoOptOutCurrentParticipations(
    cycle.status,
  )
    ? await autoOptOutInactiveCurrentParticipations(tx, cycle.id, initializedAt)
    : 0;

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
      user: {
        select: {
          questionnaireResponse: {
            select: { submittedAt: true },
          },
          lastActiveAt: true,
        },
      },
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
  const createInputs: StickyParticipationCreateInput[] = [];

  for (const participation of previousParticipations) {
    if (
      existingUserIds.has(participation.userId) ||
      initializedUserIds.has(participation.userId)
    ) {
      continue;
    }

    initializedUserIds.add(participation.userId);
    // Carry over OPTED_IN only when the user still has a submitted
    // questionnaire and has been active recently; otherwise downgrade to
    // OPTED_OUT instead of re-introducing an unmatchable participant.
    const hasSubmittedQuestionnaire =
      participation.user?.questionnaireResponse?.submittedAt != null;
    const createInput = buildStickyParticipationCreateInput(
      cycle.id,
      participation.userId,
      participation.status,
      participation.intent,
      hasSubmittedQuestionnaire,
      participation.user?.lastActiveAt ?? null,
      initializedAt,
    );
    createInputs.push(createInput);
  }

  if (createInputs.length === 0) {
    return { createdCount: 0, autoOptedOutCount: currentAutoOptedOutCount };
  }

  const retainedCreateData = createInputs
    .filter((input) => !input.autoOptedOut)
    .map((input) => input.data);
  const autoOptOutCreateData = createInputs
    .filter((input) => input.autoOptedOut)
    .map((input) => input.data);
  const retainedCreatedCount = await createCycleParticipations(
    tx,
    retainedCreateData,
  );
  const createdAutoOptedOutCount = await createCycleParticipations(
    tx,
    autoOptOutCreateData,
  );

  return {
    createdCount: retainedCreatedCount + createdAutoOptedOutCount,
    autoOptedOutCount: currentAutoOptedOutCount + createdAutoOptedOutCount,
  };
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
    return { createdCount: 0, autoOptedOutCount: 0 };
  }

  if (isCacheValid(cycle.id)) {
    return { createdCount: 0, autoOptedOutCount: 0 };
  }

  const result = await prisma.$transaction(async (tx) =>
    initializeStickyParticipations(tx, cycle),
  );

  processedCycleTimestamps.set(cycle.id, Date.now());
  return result;
}
