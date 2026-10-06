import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/common/prisma/client';

export type CodeState =
  | 'valid'
  | 'expired'
  | 'consumed'
  | 'replaced'
  | 'missing';
export async function recoveryCode(
  prisma: PrismaClient,
  tag: string,
  now: number,
  state: CodeState,
) {
  const key = `verification-code:${tag}:${randomUUID()}`;
  const email = `${randomUUID()}@example.test`;
  const row = await prisma.outboundEmail.create({
    data: {
      dedupeKey: key,
      recipientEmail: email,
      subject: 'Synthetic recovery acceptance',
      html: '<p>Synthetic acceptance</p>',
    },
  });
  if (state === 'missing') return { row, record: null };
  const record = await prisma.emailCode.create({
    data: {
      email,
      codeHash: 'synthetic-unused-hash',
      purpose: 'REGISTER',
      deliveryDedupeKey: key,
      expiresAt: new Date(now + (state === 'expired' ? -1 : 600_000)),
      consumedAt: state === 'consumed' ? new Date(now - 1) : null,
    },
  });
  if (state === 'replaced')
    await prisma.emailCode.create({
      data: {
        email,
        codeHash: 'synthetic-replacement-hash',
        purpose: 'REGISTER',
        deliveryDedupeKey: `verification-code:${tag}:${randomUUID()}`,
        expiresAt: new Date(now + 600_000),
        createdAt: new Date(now + 1),
      },
    });
  return { row, record };
}

export function assertRecoveryDatabase(url: URL) {
  const runnerDatabase = /^\/lilink_vip_test_[a-f0-9]+$/.test(url.pathname);
  const ciDatabase =
    process.env.CI === 'true' &&
    url.port === '55432' &&
    url.pathname === '/lilink_vip_test_ci';
  if (
    process.env.APP_ENV !== 'test' ||
    url.hostname !== '127.0.0.1' ||
    url.port === '5432' ||
    !(runnerDatabase || ciDatabase) ||
    !process.env.E2E_OUTPUT ||
    !process.env.E2E_MAIL_URL
  ) {
    throw new Error(
      'Run only through the disposable API E2E runner or its CI services.',
    );
  }
}

export async function waitForMailRowLock(
  prisma: PrismaClient,
  table: 'EmailCode' | 'OutboundEmail',
) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
          AND wait_event_type = 'Lock' AND query LIKE ${`%FROM "${table}"%FOR UPDATE%`}
      ) AS waiting
    `;
    if (rows[0].waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    'Mail worker did not reach the expected PostgreSQL row lock.',
  );
}

export async function withMailRowLock(
  prisma: PrismaClient,
  table: 'EmailCode' | 'OutboundEmail',
  id: string,
  work: (release: () => void) => Promise<void>,
) {
  let unlock!: () => void;
  let locked!: () => void;
  const acquired = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const locking = prisma.$transaction(async (tx) => {
    if (table === 'EmailCode')
      await tx.$queryRaw`SELECT "id" FROM "EmailCode" WHERE "id" = ${id} FOR UPDATE`;
    else
      await tx.$queryRaw`SELECT "id" FROM "OutboundEmail" WHERE "id" = ${id} FOR UPDATE`;
    locked();
    await hold;
  });
  await acquired;
  try {
    await work(unlock);
  } finally {
    unlock();
    await locking;
  }
}

export function recoveryMail(
  prisma: PrismaClient,
  tag: string,
  data: Record<string, unknown> = {},
) {
  return prisma.outboundEmail.create({
    data: {
      dedupeKey: `${tag}:${randomUUID()}`,
      recipientEmail: 'synthetic@example.test',
      subject: 'Synthetic recovery acceptance',
      html: '<p>Synthetic acceptance</p>',
      ...data,
    } as never,
  });
}
