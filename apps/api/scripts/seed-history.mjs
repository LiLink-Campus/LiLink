/**
 * Dev-only: seed historical match cycles + a meetup session for full UI testing.
 *
 * Creates:
 *   - 2 past REVEALED cycles  (history-2026-3, history-2026-4)
 *   - Alice↔Bob matched in both; Carol unmatched in history-2026-3
 *   - history-2026-4: Alice started a MeetupSession; Bob's turn to respond
 *
 * Run from apps/api/:
 *   node scripts/seed-history.mjs
 */

import { loadMonorepoEnv } from './load-env.mjs';
import { loadPrismaClientModule } from './prisma-client.mjs';

loadMonorepoEnv();

const { createPrismaClient } = await loadPrismaClientModule();
const prisma = createPrismaClient();

// ── Fetch existing user IDs ────────────────────────────────────────────────
const [alice, bob, carol, bulk1, bulk2] = await Promise.all([
  prisma.user.findUniqueOrThrow({ where: { email: 'matched.alice@bupt.edu.cn' }, select: { id: true } }),
  prisma.user.findUniqueOrThrow({ where: { email: 'matched.bob@cuc.edu.cn' }, select: { id: true } }),
  prisma.user.findUniqueOrThrow({ where: { email: 'unmatched.carol@uestc.edu.cn' }, select: { id: true } }),
  prisma.user.findUniqueOrThrow({ where: { email: 'seed.bulk.01@bupt.edu.cn' }, select: { id: true } }),
  prisma.user.findUniqueOrThrow({ where: { email: 'seed.bulk.02@cuc.edu.cn' }, select: { id: true } }),
]);

console.log('Users found:', { alice: alice.id, bob: bob.id });

function weeksAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  d.setHours(13, 0, 0, 0);
  return d;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

// ══════════════════════════════════════════════════════════════════════════
// CYCLE 1: history-2026-3  — older cycle, Alice matched Bob, Carol unmatched
// ══════════════════════════════════════════════════════════════════════════
console.log('\n--- Creating history-2026-3 ---');

const c1RevealAt = weeksAgo(8);
c1RevealAt.setHours(13, 0, 0, 0);

const cycle1 = await prisma.matchCycle.upsert({
  where: { codename: 'history-2026-3' },
  update: { status: 'REVEALED', revealAt: c1RevealAt, participationDeadline: weeksAgo(8) },
  create: {
    codename: 'history-2026-3',
    participationDeadline: weeksAgo(8),
    revealAt: c1RevealAt,
    status: 'REVEALED',
    notes: 'Seeded historical cycle (older)',
  },
});
console.log('  Cycle1:', cycle1.id);

for (const [userId, intent] of [[alice.id, 'BOTH'], [bob.id, 'BOTH'], [carol.id, 'BOTH'], [bulk1.id, 'BOTH'], [bulk2.id, 'BOTH']]) {
  await prisma.cycleParticipation.upsert({
    where: { cycleId_userId: { cycleId: cycle1.id, userId } },
    update: { status: 'OPTED_IN', intent },
    create: { cycleId: cycle1.id, userId, status: 'OPTED_IN', intent, optedInAt: weeksAgo(9) },
  });
}

let match1 = await prisma.match.findFirst({ where: { cycleId: cycle1.id, participants: { some: { userId: alice.id } } } });
if (!match1) {
  match1 = await prisma.match.create({
    data: {
      cycleId: cycle1.id,
      score: 87.4,
      reasons: ['你们都重视「真诚」与「稳定」', '沟通方式互补，一方直接、一方先听后说', '周末活动偏好高度重合'],
      reason: '你们对「认真稳定的关系」都有明确预期，沟通修复风格互补，空间需求相近。',
      conversationTopics: ['对未来的规划', '各自的求学经历', '周末最喜欢做什么'],
      narrativeSource: 'RULES_FALLBACK',
      revealedAt: c1RevealAt,
      introducedAt: new Date(c1RevealAt.getTime() + 2 * 60 * 60 * 1000),
    },
  });
  await prisma.matchParticipant.createMany({
    data: [
      { matchId: match1.id, cycleId: cycle1.id, userId: alice.id, position: 0, contactRequestedAt: daysAgo(52) },
      { matchId: match1.id, cycleId: cycle1.id, userId: bob.id,   position: 1, contactRequestedAt: daysAgo(51) },
    ],
    skipDuplicates: true,
  });
  console.log('  Match1 created:', match1.id);
} else {
  console.log('  Match1 exists:', match1.id);
}

const matchPayload1 = {
  id: match1.id, score: 87.4,
  reasons: ['你们都重视「真诚」与「稳定」', '沟通方式互补', '周末活动偏好高度重合'],
  reason: '你们对「认真稳定的关系」都有明确预期，沟通修复风格互补，空间需求相近。',
  conversationTopics: ['对未来的规划', '各自的求学经历', '周末最喜欢做什么'],
  introducedAt: new Date(c1RevealAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
  currentUserRequestedAt: daysAgo(52).toISOString(),
  reportStatus: null,
  participants: [
    { userId: alice.id, displayName: '演示-Alice', introLine: '人文方向，期待真诚相处。', email: null, contact: null, schoolName: '北京邮电大学', contactRequestedAt: daysAgo(52).toISOString() },
    { userId: bob.id,   displayName: '演示-Bob',   introLine: '理工背景，喜欢夜跑和科幻。', email: null, contact: null, schoolName: '中国传媒大学', contactRequestedAt: daysAgo(51).toISOString() },
  ],
};

for (const [userId, result] of [[alice.id, 'MATCHED'], [bob.id, 'MATCHED'], [carol.id, 'UNMATCHED']]) {
  await prisma.userCycleDashboardSnapshot.upsert({
    where: { userId_cycleId: { userId, cycleId: cycle1.id } },
    update: {},
    create: {
      userId, cycleId: cycle1.id,
      cycleRevealAt: c1RevealAt, cycleCodename: 'history-2026-3',
      participationStatus: 'OPTED_IN',
      result, visibility: result === 'MATCHED' ? 'VISIBLE' : 'NOT_APPLICABLE',
      limitedReason: null,
      matchId: result === 'MATCHED' ? match1.id : null,
      matchPayload: result === 'MATCHED' ? matchPayload1 : null,
    },
  });
}
console.log('  Snapshots done for cycle1');

// ══════════════════════════════════════════════════════════════════════════
// CYCLE 2: history-2026-4  — recent cycle, match + ACTIVE meetup session
// ══════════════════════════════════════════════════════════════════════════
console.log('\n--- Creating history-2026-4 ---');

const c2RevealAt = weeksAgo(3);
c2RevealAt.setHours(13, 0, 0, 0);

const cycle2 = await prisma.matchCycle.upsert({
  where: { codename: 'history-2026-4' },
  update: { status: 'REVEALED', revealAt: c2RevealAt, participationDeadline: weeksAgo(3) },
  create: {
    codename: 'history-2026-4',
    participationDeadline: weeksAgo(3),
    revealAt: c2RevealAt,
    status: 'REVEALED',
    notes: 'Seeded historical cycle (recent, with meetup)',
  },
});
console.log('  Cycle2:', cycle2.id);

for (const [userId, intent] of [[alice.id, 'DATE'], [bob.id, 'DATE'], [bulk1.id, 'BOTH'], [bulk2.id, 'FRIEND']]) {
  await prisma.cycleParticipation.upsert({
    where: { cycleId_userId: { cycleId: cycle2.id, userId } },
    update: { status: 'OPTED_IN', intent },
    create: { cycleId: cycle2.id, userId, status: 'OPTED_IN', intent, optedInAt: weeksAgo(4) },
  });
}

let match2 = await prisma.match.findFirst({ where: { cycleId: cycle2.id, participants: { some: { userId: alice.id } } } });
if (!match2) {
  match2 = await prisma.match.create({
    data: {
      cycleId: cycle2.id,
      score: 91.2,
      reasons: ['对稳定认真关系有一致期待', '情绪处理风格互补', '周末喜好高度一致'],
      reason: '这对组合在核心价值观与生活节奏上匹配度极高，破冰话题自然丰富。',
      conversationTopics: ['最近在看什么书/剧', '最喜欢的一次短途旅行', '对「认真相处」的定义'],
      narrativeSource: 'RULES_FALLBACK',
      revealedAt: c2RevealAt,
      introducedAt: new Date(c2RevealAt.getTime() + 1.5 * 60 * 60 * 1000),
    },
  });
  await prisma.matchParticipant.createMany({
    data: [
      { matchId: match2.id, cycleId: cycle2.id, userId: alice.id, position: 0, contactRequestedAt: daysAgo(20) },
      { matchId: match2.id, cycleId: cycle2.id, userId: bob.id,   position: 1, contactRequestedAt: daysAgo(19) },
    ],
    skipDuplicates: true,
  });
  console.log('  Match2 created:', match2.id);
} else {
  console.log('  Match2 exists:', match2.id);
}

const mpAlice2 = await prisma.matchParticipant.findUniqueOrThrow({ where: { matchId_userId: { matchId: match2.id, userId: alice.id } } });
const mpBob2   = await prisma.matchParticipant.findUniqueOrThrow({ where: { matchId_userId: { matchId: match2.id, userId: bob.id } } });

// ── MeetupSession ─────────────────────────────────────────────────────────
let session = await prisma.meetupSession.findUnique({ where: { matchId: match2.id } });
if (!session) {
  session = await prisma.meetupSession.create({
    data: {
      matchId: match2.id,
      status: 'ACTIVE',
      startedByUserId: alice.id,
      lastActiveAt: daysAgo(17),
      expiresAt: daysFromNow(7),
      effectiveExpirationWeeks: 1,
    },
  });

  await prisma.meetupParticipant.createMany({
    data: [
      { sessionId: session.id, userId: alice.id, matchParticipantId: mpAlice2.id, turnState: 'WAITING', lastSeenAt: daysAgo(17) },
      { sessionId: session.id, userId: bob.id,   matchParticipantId: mpBob2.id,   turnState: 'REQUIRED', responseRequiredAt: daysAgo(17), lastSeenAt: daysAgo(19) },
    ],
    skipDuplicates: true,
  });

  const propMessage = await prisma.meetupMessage.create({
    data: { sessionId: session.id, actorUserId: alice.id, type: 'PROPOSE', createdAt: daysAgo(17) },
  });

  const proposal = await prisma.meetupProposal.create({
    data: { sessionId: session.id, messageId: propMessage.id, actorUserId: alice.id, scope: 'BOTH', status: 'PENDING', createdAt: daysAgo(17) },
  });

  // Two time slots + one location
  const t1 = daysFromNow(3); t1.setHours(14, 0, 0, 0);
  const t1e = new Date(t1);  t1e.setHours(16, 0, 0, 0);
  const t2 = daysFromNow(5); t2.setHours(11, 0, 0, 0);
  const t2e = new Date(t2);  t2e.setHours(13, 0, 0, 0);

  await prisma.meetupOption.createMany({
    data: [
      { proposalId: proposal.id, sessionId: session.id, kind: 'TIME', status: 'PENDING', startsAt: t1, endsAt: t1e, toleranceMinutes: 15 },
      { proposalId: proposal.id, sessionId: session.id, kind: 'TIME', status: 'PENDING', startsAt: t2, endsAt: t2e, toleranceMinutes: 15 },
      { proposalId: proposal.id, sessionId: session.id, kind: 'LOCATION', status: 'PENDING', placeName: '五道口附近咖啡馆', latitude: 39.9927, longitude: 116.3563 },
    ],
    skipDuplicates: true,
  });

  await prisma.meetupSession.update({ where: { id: session.id }, data: { currentProposalId: proposal.id } });
  await prisma.meetupParticipant.update({
    where: { sessionId_userId: { sessionId: session.id, userId: bob.id } },
    data: { responseRequiredMessageId: propMessage.id },
  });
  console.log('  MeetupSession created:', session.id, '| Proposal:', proposal.id);
} else {
  console.log('  MeetupSession exists:', session.id);
}

// Snapshots for cycle2
const matchPayload2 = {
  id: match2.id, score: 91.2,
  reasons: ['对稳定认真关系有一致期待', '情绪处理风格互补', '周末喜好高度一致'],
  reason: '这对组合在核心价值观与生活节奏上匹配度极高，破冰话题自然丰富。',
  conversationTopics: ['最近在看什么书/剧', '最喜欢的一次短途旅行', '对「认真相处」的定义'],
  introducedAt: new Date(c2RevealAt.getTime() + 1.5 * 60 * 60 * 1000).toISOString(),
  currentUserRequestedAt: daysAgo(20).toISOString(),
  reportStatus: null,
  participants: [
    { userId: alice.id, displayName: '演示-Alice', introLine: '人文方向，期待真诚相处。', email: null, contact: { type: 'WECHAT', label: '微信', value: 'alice_demo' }, schoolName: '北京邮电大学', contactRequestedAt: daysAgo(20).toISOString() },
    { userId: bob.id,   displayName: '演示-Bob',   introLine: '理工背景，喜欢夜跑和科幻。', email: null, contact: { type: 'WECHAT', label: '微信', value: 'bob_demo' }, schoolName: '中国传媒大学', contactRequestedAt: daysAgo(19).toISOString() },
  ],
};

for (const [userId] of [[alice.id], [bob.id]]) {
  await prisma.userCycleDashboardSnapshot.upsert({
    where: { userId_cycleId: { userId, cycleId: cycle2.id } },
    update: {},
    create: {
      userId, cycleId: cycle2.id,
      cycleRevealAt: c2RevealAt, cycleCodename: 'history-2026-4',
      participationStatus: 'OPTED_IN',
      result: 'MATCHED', visibility: 'VISIBLE', limitedReason: null,
      matchId: match2.id, matchPayload: matchPayload2,
    },
  });
}
console.log('  Snapshots done for cycle2');

console.log('\n✅  历史数据注入完成！');
console.log('   · history-2026-3  ← 8 周前揭晓，Alice↔Bob 匹配（分 87.4），Carol 未匹配，无破冰');
console.log('   · history-2026-4  ← 3 周前揭晓，Alice↔Bob 匹配（分 91.2），Alice 已发起破冰，Bob 待响应');
console.log('\n   Alice 账号：matched.alice@bupt.edu.cn / TestDemo_LiLink_42!');
console.log('   Bob 账号  ：matched.bob@cuc.edu.cn   / TestDemo_LiLink_42!');

await prisma.$disconnect();
