import { MatchCycleStatus, ParticipationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const STICKY_PARTICIPATION_CYCLE_STATUSES: MatchCycleStatus[] = [
  'OPEN',
  'REVEAL_READY',
];

type StickyParticipationPrismaClient = Pick<
  PrismaService,
  'matchCycle' | 'cycleParticipation'
>;

type StickyParticipationCycle = {
  id: string;
  revealAt: Date;
  createdAt: Date;
  status: MatchCycleStatus;
};

function shouldInitializeStickyParticipations(status: MatchCycleStatus) {
  return STICKY_PARTICIPATION_CYCLE_STATUSES.includes(status);
}

function buildStickyParticipationCreateInput(
  cycleId: string,
  userId: string,
  status: ParticipationStatus,
  initializedAt: Date,
): Prisma.CycleParticipationCreateManyInput {
  return {
    cycleId,
    userId,
    status,
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

  const existingParticipations = await prisma.cycleParticipation.findMany({
    where: { cycleId: cycle.id },
    select: { userId: true },
  });
  const existingUserIds = new Set(
    existingParticipations.map((participation) => participation.userId),
  );

  const previousParticipations = await prisma.cycleParticipation.findMany({
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
        initializedAt,
      ),
    );
  }

  if (createData.length === 0) {
    return { createdCount: 0 };
  }

  const result = await prisma.cycleParticipation.createMany({
    data: createData,
    skipDuplicates: true,
  });

  return { createdCount: result.count };
}
