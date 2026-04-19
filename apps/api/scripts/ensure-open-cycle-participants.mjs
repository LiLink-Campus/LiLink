/**
 * Ensures the target OPEN match cycle has enough OPTED_IN participants with valid
 * hard-matching questionnaire answers (same eligibility as matching).
 *
 * Use after creating a new cycle (e.g. "第三轮"): seed only attached users to the
 * cycle that existed at seed time; new cycles start with zero participations.
 *
 * Usage (from repo root, after npm run build:shared or via npm script):
 *   cd apps/api && node scripts/ensure-open-cycle-participants.mjs
 *   cd apps/api && node scripts/ensure-open-cycle-participants.mjs --codename=第三轮
 */
import { PrismaClient } from '@prisma/client';
import { parseHardMatchAnswers } from '@lilink/shared';
import { loadMonorepoEnv } from './load-env.mjs';

loadMonorepoEnv();

const prisma = new PrismaClient();

function readCodenameArg() {
  const prefixed = process.argv.find((a) => a.startsWith('--codename='));
  if (prefixed) {
    return prefixed.slice('--codename='.length).trim();
  }
  return null;
}

async function main() {
  const codename = readCodenameArg();

  let cycle;
  if (codename) {
    cycle = await prisma.matchCycle.findFirst({ where: { codename } });
    if (!cycle) {
      console.error(`No cycle with codename "${codename}".`);
      process.exit(1);
    }
  } else {
    cycle = await prisma.matchCycle.findFirst({
      where: { status: 'OPEN' },
      orderBy: { revealAt: 'desc' },
    });
    if (!cycle) {
      console.error('No OPEN cycle found. Create or open a cycle in /admin first.');
      process.exit(1);
    }
  }

  if (cycle.status !== 'OPEN') {
    console.warn(
      `Note: cycle "${cycle.codename}" status is ${cycle.status} (not OPEN). Continuing anyway for local dev.`,
    );
  }

  const users = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      questionnaireResponse: {
        is: { submittedAt: { not: null } },
      },
    },
    include: { questionnaireResponse: true },
  });

  const eligible = [];
  for (const user of users) {
    const answers = /** @type {Record<string, unknown>} */ (
      user.questionnaireResponse?.answers ?? {}
    );
    if (parseHardMatchAnswers(answers)) {
      eligible.push(user);
    }
  }

  if (eligible.length < 2) {
    console.error(
      `Only ${eligible.length} user(s) have submitted questionnaire + valid hard-match answers. Run: npm run db:seed`,
    );
    process.exit(1);
  }

  let upserted = 0;
  for (const user of eligible) {
    // Default to BOTH so a freshly-opened cycle is immediately matchable in
    // operations / smoke tests; users can still switch to FRIEND or DATE later.
    await prisma.cycleParticipation.upsert({
      where: {
        cycleId_userId: { cycleId: cycle.id, userId: user.id },
      },
      update: {
        status: 'OPTED_IN',
        intent: 'BOTH',
        optedInAt: new Date(),
      },
      create: {
        cycleId: cycle.id,
        userId: user.id,
        status: 'OPTED_IN',
        intent: 'BOTH',
        optedInAt: new Date(),
      },
    });
    upserted += 1;
  }

  console.log(
    `Done: ${upserted} user(s) set to OPTED_IN for cycle "${cycle.codename}" (id=${cycle.id}).`,
  );
  console.log(
    'You can run matching preview/run in admin. Password for seed users: TestDemo_LiLink_42!',
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
