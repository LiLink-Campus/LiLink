import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';

const tag = `retired-migration-${randomUUID()}`;

describe('Retired workflow queue migration (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('cancels only unfinished retired mail and outcomes, keeping history and active workflows', async () => {
    const rollback = new Error('Roll back synthetic migration fixtures.');
    await expect(
      prisma.$transaction(async (tx) => {
        const emailIds: string[] = [];
        const eventIds: string[] = [];
        for (const status of ['PENDING', 'FAILED', 'PROCESSING'] as const) {
          emailIds.push(
            (
              await tx.outboundEmail.create({
                data: {
                  dedupeKey: `meetup-reminder:${tag}:${status}`,
                  recipientEmail: `${tag}@example.invalid`,
                  subject: 'Historical reminder',
                  html: '<p>Historical reminder</p>',
                  status,
                  nextAttemptAt: new Date(),
                },
              })
            ).id,
          );
          for (const name of [
            'meetup_session_created',
            'match_contact_requested',
          ]) {
            eventIds.push(
              (
                await tx.productEventOutbox.create({
                  data: { eventId: `${tag}:${name}:${status}`, name, status },
                })
              ).id,
            );
          }
        }
        const sentEmail = await tx.outboundEmail.create({
          data: {
            dedupeKey: `meetup-reminder:${tag}:sent`,
            recipientEmail: `${tag}@example.invalid`,
            subject: 'Already sent reminder',
            html: '<p>Historical reminder</p>',
            status: 'SENT',
            sentAt: new Date(),
          },
        });
        const currentEmail = await tx.outboundEmail.create({
          data: {
            dedupeKey: `match-reveal:${tag}:0`,
            recipientEmail: `${tag}@example.invalid`,
            subject: 'Current reveal',
            html: '<p>Current reveal</p>',
          },
        });
        const recordedEvent = await tx.productEventOutbox.create({
          data: {
            eventId: `${tag}:recorded`,
            name: 'meetup_session_created',
            status: 'RECORDED',
            recordedAt: new Date(),
          },
        });
        const currentEvent = await tx.productEventOutbox.create({
          data: { eventId: `${tag}:current`, name: 'coupon_redeemed' },
        });
        const migration = readFileSync(
          join(
            __dirname,
            '../prisma/migrations/20260913120000_retire_meetup_reminders/migration.sql',
          ),
          'utf8',
        );
        for (const statement of migration
          .split(';')
          .filter((sql) => sql.trim())) {
          await tx.$executeRawUnsafe(statement);
        }

        expect(
          await tx.outboundEmail.count({
            where: {
              id: { in: emailIds },
              status: 'EXHAUSTED',
              nextAttemptAt: null,
            },
          }),
        ).toBe(3);
        expect(
          await tx.productEventOutbox.count({
            where: {
              id: { in: eventIds },
              status: 'EXHAUSTED',
              nextAttemptAt: null,
            },
          }),
        ).toBe(6);
        expect(
          await tx.outboundEmail.findUniqueOrThrow({
            where: { id: sentEmail.id },
          }),
        ).toEqual(sentEmail);
        expect(
          await tx.outboundEmail.findUniqueOrThrow({
            where: { id: currentEmail.id },
          }),
        ).toEqual(currentEmail);
        expect(
          await tx.productEventOutbox.findUniqueOrThrow({
            where: { id: recordedEvent.id },
          }),
        ).toEqual(recordedEvent);
        expect(
          await tx.productEventOutbox.findUniqueOrThrow({
            where: { id: currentEvent.id },
          }),
        ).toEqual(currentEvent);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
