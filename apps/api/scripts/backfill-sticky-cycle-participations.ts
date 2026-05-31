import { createPrismaClient } from '../src/common/prisma/client';
import { config } from 'dotenv';
import path from 'path';
import { ensureStickyCycleParticipations } from '../src/common/participation/sticky-cycle-participation';
const apiRoot = process.cwd();
const repoRoot = path.resolve(apiRoot, '..', '..');

function loadMonorepoEnv() {
  config({ path: path.join(repoRoot, '.env') });
  config({ path: path.join(apiRoot, '.env'), override: true });
}

loadMonorepoEnv();

const prisma = createPrismaClient();

function printHelp() {
  console.log(`Usage:
  npm run sticky-participations:backfill
  npm run sticky-participations:backfill -- --cycle-id=<cycle-id>
  npm run sticky-participations:backfill -- --codename=<codename>`);
}

function readArg(prefix: string) {
  const match = process.argv.find((value) => value.startsWith(prefix));
  if (!match) {
    return null;
  }

  const rawValue = match.slice(prefix.length).trim();
  return rawValue.length > 0 ? rawValue : null;
}

async function loadTargetCycles() {
  const cycleId = readArg('--cycle-id=');
  const codename = readArg('--codename=');

  if (cycleId && codename) {
    throw new Error('Use either --cycle-id or --codename, not both.');
  }

  const select = {
    id: true,
    codename: true,
    status: true,
    revealAt: true,
    createdAt: true,
  } as const;

  if (cycleId) {
    return prisma.matchCycle.findMany({
      where: { id: cycleId },
      select,
    });
  }

  if (codename) {
    return prisma.matchCycle.findMany({
      where: { codename },
      select,
    });
  }

  return prisma.matchCycle.findMany({
    where: {
      status: {
        in: ['OPEN', 'REVEAL_READY'],
      },
    },
    orderBy: [{ revealAt: 'asc' }, { createdAt: 'asc' }],
    select,
  });
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }

  const cycles = await loadTargetCycles();

  if (cycles.length === 0) {
    throw new Error('No matching cycle was found.');
  }

  let totalCreatedCount = 0;
  let totalAutoOptedOutCount = 0;

  for (const cycle of cycles) {
    const result = await ensureStickyCycleParticipations(prisma, cycle);
    totalCreatedCount += result.createdCount;
    totalAutoOptedOutCount += result.autoOptedOutCount;
    console.log(
      `[sticky-backfill] ${cycle.codename} (${cycle.id}) status=${cycle.status} created=${result.createdCount} autoOptedOut=${result.autoOptedOutCount}`,
    );
  }

  console.log(
    `[sticky-backfill] Completed ${cycles.length} cycle(s); created ${totalCreatedCount} participation record(s), auto-opted-out ${totalAutoOptedOutCount}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
