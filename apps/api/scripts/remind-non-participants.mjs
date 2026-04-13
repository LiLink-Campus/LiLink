/**
 * Send a bulk reminder email to users who submitted the questionnaire but
 * have NOT opted-in to the earliest-created OPEN match cycle.
 *
 * Emails are inserted into the OutboundEmail queue and flushed immediately
 * via nodemailer (same SMTP transport the app uses).
 *
 * Usage (from repo root):
 *   cd apps/api && node scripts/remind-non-participants.mjs
 *   cd apps/api && node scripts/remind-non-participants.mjs --dry-run
 *   cd apps/api && node scripts/remind-non-participants.mjs --codename=第三轮
 */
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import { loadMonorepoEnv } from './load-env.mjs';

loadMonorepoEnv();

const prisma = new PrismaClient();

const SMTP_HOST = process.env.SMTP_HOST ?? 'localhost';
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 1025);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER ?? '';
const SMTP_PASS = process.env.SMTP_PASS ?? '';
const SMTP_FROM = process.env.SMTP_FROM ?? 'LiLink <noreply@lilink.zone>';

function parseArgs() {
  const args = { dryRun: false, codename: null };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg.startsWith('--codename=')) {
      args.codename = arg.slice('--codename='.length).trim();
    }
  }
  return args;
}

function buildReminderHtml(cycleName) {
  return `
<div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #333;">
  <h2 style="color: #6366f1;">LiLink 参与提醒</h2>
  <p>你好！</p>
  <p>我们注意到你已经填写了 LiLink 匹配问卷，但尚未在当前轮次<strong>「${cycleName}」</strong>中选择参与。</p>
  <p>是不是忘记了？如果你希望参加本轮匹配，请登录 LiLink 并点击「参与」按钮。</p>
  <p style="margin-top: 24px; padding: 12px; background: #f5f3ff; border-radius: 8px; font-size: 13px; color: #6b7280;">
    本邮件为群发提醒。如果你已决定不参加本轮匹配，请忽略此邮件，不会再因此轮次打扰你。
  </p>
  <p style="margin-top: 24px; color: #9ca3af; font-size: 12px;">— LiLink 团队</p>
</div>`.trim();
}

async function main() {
  const { dryRun, codename } = parseArgs();

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
      orderBy: { createdAt: 'asc' },
    });
    if (!cycle) {
      console.error('No OPEN cycle found.');
      process.exit(1);
    }
  }

  console.log(`Target cycle: "${cycle.codename}" (id=${cycle.id}, status=${cycle.status})`);

  const nonParticipants = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      isTest: false,
      questionnaireResponse: {
        is: { submittedAt: { not: null } },
      },
      participations: {
        none: {
          cycleId: cycle.id,
          status: 'OPTED_IN',
        },
      },
    },
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  });

  console.log(`Found ${nonParticipants.length} user(s) who submitted questionnaire but did not opt-in.`);

  if (nonParticipants.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  for (const user of nonParticipants) {
    console.log(`  - ${user.email} (${user.displayName ?? 'no display name'})`);
  }

  if (dryRun) {
    console.log('\n--dry-run: no emails queued.');
    return;
  }

  const subject = `LiLink 提醒：你是不是忘记参与「${cycle.codename}」了？`;
  const html = buildReminderHtml(cycle.codename);
  const now = new Date();
  let queued = 0;

  for (const user of nonParticipants) {
    const dedupeKey = `cycle-reminder:${cycle.id}:${user.id}`;

    await prisma.outboundEmail.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        dedupeKey,
        recipientEmail: user.email,
        subject,
        html,
        status: 'PENDING',
        maxAttempts: 3,
        nextAttemptAt: now,
      },
    });
    queued++;
  }

  console.log(`\nQueued ${queued} reminder email(s). Flushing now...`);

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  const pendingEmails = await prisma.outboundEmail.findMany({
    where: {
      dedupeKey: { startsWith: `cycle-reminder:${cycle.id}:` },
      status: 'PENDING',
    },
    orderBy: { createdAt: 'asc' },
  });

  let sent = 0;
  let failed = 0;

  for (const email of pendingEmails) {
    await prisma.outboundEmail.update({
      where: { id: email.id },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, lastAttemptAt: new Date() },
    });

    try {
      await transporter.sendMail({
        from: SMTP_FROM,
        to: email.recipientEmail,
        subject: email.subject,
        html: email.html,
      });

      await prisma.outboundEmail.update({
        where: { id: email.id },
        data: { status: 'SENT', sentAt: new Date(), nextAttemptAt: null },
      });
      sent++;
      console.log(`  ✓ Sent to ${email.recipientEmail}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const nextAttempt = email.attempts + 1 >= email.maxAttempts;
      await prisma.outboundEmail.update({
        where: { id: email.id },
        data: {
          status: nextAttempt ? 'EXHAUSTED' : 'FAILED',
          errorMessage,
          nextAttemptAt: nextAttempt ? null : new Date(Date.now() + 60_000),
        },
      });
      failed++;
      console.error(`  ✗ Failed for ${email.recipientEmail}: ${errorMessage}`);
    }
  }

  console.log(`\nDone: ${sent} sent, ${failed} failed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
