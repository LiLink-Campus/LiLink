import { Prisma } from '../prisma/client';

export function matchIdFromEmailKey(key: string): string | null {
  return /^match-(?:reveal|introduction):([^:]+):[^:]+$/.exec(key)?.[1] ?? null;
}

export async function cancelMatchEmails(
  tx: Pick<Prisma.TransactionClient, 'outboundEmail'>,
  matchIds: string[],
  reason: string,
) {
  if (matchIds.length === 0) return;
  await tx.outboundEmail.updateMany({
    where: {
      status: { in: ['PENDING', 'FAILED', 'PROCESSING'] },
      OR: matchIds.flatMap((id) => [
        { dedupeKey: { startsWith: `match-reveal:${id}:` } },
        { dedupeKey: { startsWith: `match-introduction:${id}:` } },
      ]),
    },
    data: { status: 'EXHAUSTED', nextAttemptAt: null, errorMessage: reason },
  });
}

// The caller holds the Match row lock through validation and claiming.
export async function canSendMatchEmail(
  tx: Prisma.TransactionClient,
  matchId: string,
  recipientEmail: string,
) {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    select: {
      revealedAt: true,
      introducedAt: true,
      cycle: { select: { status: true } },
      reports: { select: { id: true }, take: 1 },
      participants: {
        select: {
          userId: true,
          user: { select: { email: true, status: true, deactivatedAt: true } },
        },
      },
    },
  });
  if (
    !match?.revealedAt ||
    !match.introducedAt ||
    match.cycle.status !== 'REVEALED' ||
    match.reports.length > 0 ||
    match.participants.length !== 2 ||
    match.participants.some(
      ({ user }) => user.status !== 'ACTIVE' || user.deactivatedAt !== null,
    ) ||
    !match.participants.some(({ user }) => user.email === recipientEmail)
  )
    return false;
  const [left, right] = match.participants;
  return !(await tx.block.findFirst({
    where: {
      OR: [
        { blockerId: left.userId, blockedId: right.userId },
        { blockerId: right.userId, blockedId: left.userId },
      ],
    },
    select: { id: true },
  }));
}
