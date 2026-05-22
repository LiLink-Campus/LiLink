import { loadMonorepoEnv } from './load-env.mjs';
import { loadPrismaClientModule } from './prisma-client.mjs';

loadMonorepoEnv();

const ALEX_EMAIL = 'meetup.demo.alex@lilink.test';
const RIVER_EMAIL = 'meetup.demo.river@lilink.test';
const CYCLE_CODENAME = 'manual-meetup-demo';
const MIN_PASSWORD_LENGTH = 12;
const PRODUCTION_ENVIRONMENT_NAMES = new Set(['prod', 'production']);
const SAFE_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SAFE_DATABASE_TARGET_MARKER_PATTERN =
  /(^|[-_.])(?:dev|development|test|testing|demo|local)(?:[-_.]|$)/i;
const DEMO_MEETUP_LOCATION_OPTIONS = [
  {
    locationCandidateId: 'social-suoshe',
    placeName: 'social索社',
    latitude: 18.39608,
    longitude: 110.022687,
  },
  {
    locationCandidateId: 'vibes-restaurant-bar',
    placeName: 'vibes餐吧',
    latitude: 18.392448,
    longitude: 110.020263,
  },
  {
    locationCandidateId: 'living-area-2-canteen',
    placeName: '生活二区食堂',
    latitude: 18.395834,
    longitude: 110.023802,
  },
];
const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:3000';
const SCENARIOS = new Set(['pending-response', 'not-started']);

let prisma;
let argon2;

function readArgument(name) {
  const prefixed = `--${name}=`;
  const direct = process.argv.find((value) => value.startsWith(prefixed));

  if (direct) {
    return direct.slice(prefixed.length);
  }

  const index = process.argv.findIndex((value) => value === `--${name}`);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function readBooleanArgument(name) {
  return process.argv.includes(`--${name}`);
}

function readDemoPassword() {
  const password =
    readArgument('password') ?? process.env.MEETUP_DEMO_PASSWORD ?? '';
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `A demo password with at least ${MIN_PASSWORD_LENGTH} characters is required. Pass --password or set MEETUP_DEMO_PASSWORD.`,
    );
  }

  return password;
}

function isProductionLikeEnvironment() {
  return [process.env.APP_ENV, process.env.NODE_ENV]
    .map((value) => value?.trim().toLowerCase())
    .some((value) => value && PRODUCTION_ENVIRONMENT_NAMES.has(value));
}

function hasSafeDatabaseTargetMarker(value) {
  return SAFE_DATABASE_TARGET_MARKER_PATTERN.test(value);
}

function readDatabaseTarget() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      'Refusing to seed meetup demo data because DATABASE_URL is not set.',
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error(
      'Refusing to seed meetup demo data because DATABASE_URL is not a valid URL.',
    );
  }

  const hostname = parsedUrl.hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  const databaseName = decodeURIComponent(
    parsedUrl.pathname.replace(/^\/+/, '').split('/')[0] ?? '',
  );

  return { hostname, databaseName };
}

function isSafeDatabaseTarget(databaseTarget) {
  return (
    SAFE_DATABASE_HOSTS.has(databaseTarget.hostname) ||
    hasSafeDatabaseTargetMarker(databaseTarget.hostname) ||
    hasSafeDatabaseTargetMarker(databaseTarget.databaseName)
  );
}

function assertSafeRuntime() {
  const allowProductionSeed =
    readBooleanArgument('allow-production-demo-seed') ||
    process.env.MEETUP_DEMO_ALLOW_PRODUCTION === '1';

  if (allowProductionSeed) {
    return;
  }

  if (isProductionLikeEnvironment()) {
    throw new Error(
      'Refusing to seed meetup demo data in production. Set MEETUP_DEMO_ALLOW_PRODUCTION=1 or pass --allow-production-demo-seed only for an intentional demo-data operation.',
    );
  }

  const databaseTarget = readDatabaseTarget();
  if (isSafeDatabaseTarget(databaseTarget)) {
    return;
  }

  throw new Error(
    `Refusing to seed meetup demo data into database host "${databaseTarget.hostname || 'unknown'}" and database "${databaseTarget.databaseName || 'unknown'}". Use a local/dev/test/demo database, or set MEETUP_DEMO_ALLOW_PRODUCTION=1 or pass --allow-production-demo-seed only for an intentional demo-data operation.`,
  );
}

function participantPayload(user, profile, contactRequestedAt) {
  return {
    userId: user.id,
    displayName: user.displayName,
    introLine: profile.headline,
    email: user.email,
    schoolName: null,
    contactRequestedAt: contactRequestedAt.toISOString(),
  };
}

async function upsertDemoUser(tx, input) {
  const user = await tx.user.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      passwordHash: input.passwordHash,
      status: 'ACTIVE',
      displayName: input.displayName,
      preferredLocale: 'zh-CN',
      meetupExpirationWeeks: 2,
      isTest: true,
      acceptedTermsAt: input.now,
      profile: {
        create: {
          fullName: input.fullName,
          headline: input.headline,
          bio: input.bio,
        },
      },
    },
    update: {
      passwordHash: input.passwordHash,
      status: 'ACTIVE',
      displayName: input.displayName,
      preferredLocale: 'zh-CN',
      meetupExpirationWeeks: 2,
      isTest: true,
      acceptedTermsAt: input.now,
    },
  });

  const profile = await tx.userProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      fullName: input.fullName,
      headline: input.headline,
      bio: input.bio,
    },
    update: {
      fullName: input.fullName,
      headline: input.headline,
      bio: input.bio,
    },
  });

  return { user, profile };
}

async function createPendingMeetupSession(tx, input) {
  const session = await tx.meetupSession.create({
    data: {
      matchId: input.match.id,
      status: 'ACTIVE',
      startedByUserId: input.river.user.id,
      lastActiveAt: input.now,
      effectiveExpirationWeeks: 2,
      expiresAt: addDays(input.now, 14),
    },
  });

  const alexParticipant = await tx.meetupParticipant.create({
    data: {
      sessionId: session.id,
      userId: input.alex.user.id,
      matchParticipantId: input.alexMatchParticipant.id,
      turnState: 'REQUIRED',
      responseRequiredAt: input.now,
    },
  });
  await tx.meetupParticipant.create({
    data: {
      sessionId: session.id,
      userId: input.river.user.id,
      matchParticipantId: input.riverMatchParticipant.id,
      turnState: 'WAITING',
    },
  });

  const message = await tx.meetupMessage.create({
    data: {
      sessionId: session.id,
      actorUserId: input.river.user.id,
      type: 'PROPOSE',
      notePreset: '先用低压力方式见一面',
      noteText: '我选了两个时间和三个地点，你看哪个更舒服。',
      createdAt: input.now,
    },
  });
  const proposal = await tx.meetupProposal.create({
    data: {
      sessionId: session.id,
      messageId: message.id,
      actorUserId: input.river.user.id,
      scope: 'BOTH',
      status: 'PENDING',
      createdAt: input.now,
    },
  });

  const timeOneStart = addHours(addDays(input.now, 1), 1);
  const timeTwoStart = addHours(addDays(input.now, 2), 2);
  await tx.meetupOption.createMany({
    data: [
      {
        sessionId: session.id,
        proposalId: proposal.id,
        kind: 'TIME',
        status: 'PENDING',
        startsAt: timeOneStart,
        endsAt: addHours(timeOneStart, 1),
        toleranceMinutes: 10,
      },
      {
        sessionId: session.id,
        proposalId: proposal.id,
        kind: 'TIME',
        status: 'PENDING',
        startsAt: timeTwoStart,
        endsAt: addHours(timeTwoStart, 1.5),
        toleranceMinutes: 15,
      },
      ...DEMO_MEETUP_LOCATION_OPTIONS.map((option) => ({
        sessionId: session.id,
        proposalId: proposal.id,
        kind: 'LOCATION',
        status: 'PENDING',
        ...option,
      })),
    ],
  });

  await tx.meetupSession.update({
    where: { id: session.id },
    data: { currentProposalId: proposal.id },
  });
  await tx.meetupParticipant.update({
    where: { id: alexParticipant.id },
    data: { responseRequiredMessageId: message.id },
  });
  await tx.auditLog.create({
    data: {
      actorId: input.river.user.id,
      action: 'meetup.session_started',
      metadata: {
        sessionId: session.id,
        matchId: input.match.id,
        proposalId: proposal.id,
        seeded: true,
      },
    },
  });

  return { session, proposal };
}

async function seedScenario(scenario, password) {
  const now = new Date();
  const passwordHash = await argon2.hash(password);

  return prisma.$transaction(async (tx) => {
    await tx.matchCycle.deleteMany({ where: { codename: CYCLE_CODENAME } });

    const alex = await upsertDemoUser(tx, {
      email: ALEX_EMAIL,
      passwordHash,
      now,
      displayName: 'Alex 破冰体验号',
      fullName: 'Alex Chen',
      headline: '喜欢散步聊天，也愿意认真推进一次舒服的见面。',
      bio: '手工破冰体验账号。',
    });
    const river = await upsertDemoUser(tx, {
      email: RIVER_EMAIL,
      passwordHash,
      now,
      displayName: 'River 对方体验号',
      fullName: 'River Lin',
      headline: '平时喜欢咖啡和看展，更偏向轻松但明确的线下见面。',
      bio: '手工破冰体验对方账号。',
    });

    const revealAt = addHours(now, -1);
    const cycle = await tx.matchCycle.create({
      data: {
        codename: CYCLE_CODENAME,
        status: 'REVEALED',
        revealAt,
        participationDeadline: addHours(now, -2),
        notes: `Manual meetup QA demo cycle (${scenario}).`,
      },
    });

    await tx.cycleParticipation.createMany({
      data: [
        {
          cycleId: cycle.id,
          userId: alex.user.id,
          status: 'OPTED_IN',
          intent: 'DATE',
          optedInAt: addHours(now, -2),
        },
        {
          cycleId: cycle.id,
          userId: river.user.id,
          status: 'OPTED_IN',
          intent: 'DATE',
          optedInAt: addHours(now, -2),
        },
      ],
    });

    const match = await tx.match.create({
      data: {
        cycleId: cycle.id,
        score: 0.91,
        revealedAt: revealAt,
        introducedAt: now,
      },
    });

    const alexMatchParticipant = await tx.matchParticipant.create({
      data: {
        matchId: match.id,
        cycleId: cycle.id,
        userId: alex.user.id,
        position: 0,
        contactRequestedAt: now,
      },
    });
    const riverMatchParticipant = await tx.matchParticipant.create({
      data: {
        matchId: match.id,
        cycleId: cycle.id,
        userId: river.user.id,
        position: 1,
        contactRequestedAt: now,
      },
    });

    let seededSession = null;
    if (scenario === 'pending-response') {
      seededSession = await createPendingMeetupSession(tx, {
        now,
        match,
        alex,
        river,
        alexMatchParticipant,
        riverMatchParticipant,
      });
    }

    const matchPayload = {
      id: match.id,
      score: match.score,
      introducedAt: now.toISOString(),
      currentUserRequestedAt: now.toISOString(),
      reportStatus: null,
      participants: [
        participantPayload(alex.user, alex.profile, now),
        participantPayload(river.user, river.profile, now),
      ],
    };

    await tx.userCycleDashboardSnapshot.createMany({
      data: [alex.user, river.user].map((user) => ({
        userId: user.id,
        cycleId: cycle.id,
        cycleRevealAt: revealAt,
        cycleCodename: cycle.codename,
        participationStatus: 'OPTED_IN',
        result: 'MATCHED',
        visibility: 'VISIBLE',
        limitedReason: null,
        matchId: match.id,
        matchPayload,
      })),
    });

    return {
      scenario,
      userEmail: ALEX_EMAIL,
      counterpartEmail: RIVER_EMAIL,
      matchId: match.id,
      sessionId: seededSession?.session.id ?? null,
      proposalId: seededSession?.proposal.id ?? null,
      loginUrl: `${CLIENT_ORIGIN}/login`,
      directUrl: seededSession
        ? `${CLIENT_ORIGIN}/login?next=/dashboard/meetup/${seededSession.session.id}`
        : `${CLIENT_ORIGIN}/login?next=/dashboard/meetup/start?matchId=${match.id}`,
    };
  });
}

async function main() {
  assertSafeRuntime();

  const scenario = readArgument('scenario')?.trim() || 'pending-response';
  if (!SCENARIOS.has(scenario)) {
    throw new Error(
      `Unsupported --scenario=${scenario}. Use one of: ${Array.from(SCENARIOS).join(', ')}.`,
    );
  }

  const password = readDemoPassword();
  argon2 = (await import('argon2')).default;

  const { createPrismaClient } = await loadPrismaClientModule();
  prisma = createPrismaClient();

  const result = await seedScenario(scenario, password);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
