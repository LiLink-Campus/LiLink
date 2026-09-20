import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DashboardSnapshotService } from '../src/common/dashboard/dashboard-snapshot.service';
import { MailService } from '../src/common/mail/mail.service';
import { CyclesService } from '../src/modules/cycles/cycles.service';
import { CyclesAutomationService } from '../src/modules/cycles/cycles-automation.service';
import { RetiredProductEventsService } from '../src/modules/retired-product-events/retired-product-events.service';
import { env } from '../src/config/env';

it('pauses real scheduled writes and mail, then resumes them against disposable PostgreSQL and Mailpit', async () => {
  const target = new URL(env.DATABASE_URL);
  const mailbox = new URL(process.env.E2E_MAIL_URL!);
  if (
    target.hostname !== '127.0.0.1' ||
    target.port === '5432' ||
    !target.pathname.startsWith('/lilink_vip_test_') ||
    mailbox.hostname !== '127.0.0.1' ||
    env.SMTP_HOST !== '127.0.0.1'
  )
    throw new Error('Requires disposable local PostgreSQL and Mailpit.');
  const tag = `maintenance-${randomUUID()}`;
  const original = {
    RELEASE_MAINTENANCE: env.RELEASE_MAINTENANCE,
    BACKGROUND_JOBS_ENABLED: env.BACKGROUND_JOBS_ENABLED,
    MAIL_DELIVERY_ENABLED: env.MAIL_DELIVERY_ENABLED,
  };
  const db = createPrismaClient();
  const mail = new MailService(db as PrismaService);
  const automation = new CyclesAutomationService(
    new CyclesService(
      db as PrismaService,
      new DashboardSnapshotService(db as PrismaService),
      mail,
    ),
  );
  const retention = new RetiredProductEventsService(db as PrismaService);
  const previousCurrent = await db.questionnaireVersion.findMany({
    where: { isCurrent: true },
    select: { id: true },
  });
  try {
    await db.questionnaireVersion.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    });
    await db.questionnaireVersion.create({
      data: { id: tag, title: tag, isCurrent: true },
    });
    await db.matchCycle.create({
      data: {
        id: tag,
        codename: tag,
        status: 'OPEN',
        participationDeadline: new Date(Date.now() - 120_000),
        revealAt: new Date(Date.now() - 60_000),
      },
    });
    await db.outboundEmail.create({
      data: {
        id: tag,
        dedupeKey: tag,
        recipientEmail: `${tag}@example.test`,
        subject: tag,
        text: tag,
        html: tag,
      },
    });
    await db.productEvent.create({
      data: {
        id: tag,
        eventId: tag,
        name: tag,
        kind: 'FOOTPRINT',
        source: 'SERVER',
        createdAt: new Date('2020-01-01'),
      },
    });
    await db.productEventOutbox.create({
      data: {
        id: tag,
        eventId: tag,
        name: tag,
        createdAt: new Date('2020-01-01'),
      },
    });

    for (const mode of ['maintenance', 'switches']) {
      env.RELEASE_MAINTENANCE = mode === 'maintenance';
      env.BACKGROUND_JOBS_ENABLED = mode === 'maintenance';
      env.MAIL_DELIVERY_ENABLED = mode === 'maintenance';
      await automation.handleTick();
      await retention.handleRetention();
      await mail.handleEmailQueue();
      await mail.flushQueuedEmails({ dedupeKeys: [tag] });
      expect(
        await db.matchCycle.findUnique({
          where: { id: tag },
          select: { status: true },
        }),
      ).toEqual({ status: 'OPEN' });
      expect(
        await db.outboundEmail.findUnique({
          where: { id: tag },
          select: { status: true, attempts: true },
        }),
      ).toEqual({ status: 'PENDING', attempts: 0 });
      expect(await db.productEvent.count({ where: { id: tag } })).toBe(1);
      expect(await db.productEventOutbox.count({ where: { id: tag } })).toBe(1);
    }

    Object.assign(env, {
      RELEASE_MAINTENANCE: false,
      BACKGROUND_JOBS_ENABLED: true,
      MAIL_DELIVERY_ENABLED: true,
    });
    await automation.handleTick();
    await retention.handleRetention();
    await mail.handleEmailQueue();
    expect(
      await db.matchCycle.findUnique({
        where: { id: tag },
        select: { status: true },
      }),
    ).toEqual({ status: 'REVEALED' });
    expect(await db.productEvent.count({ where: { id: tag } })).toBe(0);
    expect(await db.productEventOutbox.count({ where: { id: tag } })).toBe(0);
    expect(
      await db.outboundEmail.findUnique({
        where: { id: tag },
        select: { status: true, attempts: true },
      }),
    ).toEqual({ status: 'SENT', attempts: 1 });
    const messages = (await (
      await fetch(
        `${mailbox.origin}/api/v1/search?query=${encodeURIComponent(`to:${tag}@example.test`)}`,
      )
    ).json()) as { messages: { Subject: string }[] };
    expect(messages.messages.some((message) => message.Subject === tag)).toBe(
      true,
    );
  } finally {
    Object.assign(env, original);
    (mail as unknown as { transporter: { close(): void } }).transporter.close();
    await db.outboundEmail.deleteMany({ where: { id: tag } });
    await db.productEvent.deleteMany({ where: { id: tag } });
    await db.productEventOutbox.deleteMany({ where: { id: tag } });
    await db.auditLog.deleteMany({
      where: { metadata: { path: ['cycleId'], equals: tag } },
    });
    await db.matchCycle.deleteMany({ where: { id: tag } });
    await db.questionnaireVersion.deleteMany({ where: { id: tag } });
    await db.questionnaireVersion.updateMany({
      where: { id: { in: previousCurrent.map((v) => v.id) } },
      data: { isCurrent: true },
    });
    await db.$disconnect();
  }
}, 30_000);
