import { MailService } from '../src/common/mail/mail.service';
import { PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { env } from '../src/config/env';
import { recoveryMail } from './mail-recovery-data';
import { smtpAckProxy } from './mail-recovery-smtp';

export async function finalAttemptCompletionFault(input: {
  prisma: PrismaClient;
  deliveryDb: PrismaClient;
  mail: MailService;
  tag: string;
  fault: (action: 'pause' | 'unpause') => void;
  advance: (ms: number) => void;
  received: () => Promise<number>;
}) {
  const { prisma, deliveryDb, mail, tag, fault, advance, received } = input;
  const row = await recoveryMail(prisma, tag, { maxAttempts: 1 });
  const baseline = await received();
  const oldPort = env.SMTP_PORT;
  const proxy = await smtpAckProxy(oldPort);
  env.SMTP_PORT = proxy.port;
  const worker = new MailService(deliveryDb as PrismaService);
  let paused = false;
  try {
    const sending = worker.deliverQueuedEmailNow(row.dedupeKey);
    await proxy.ready;
    expect(await received()).toBe(baseline + 1);
    fault('pause');
    paused = true;
    proxy.release();
    const start = performance.now();
    await expect(sending).rejects.toThrow();
    const writeFailureElapsedMs = performance.now() - start;
    expect(writeFailureElapsedMs).toBeLessThan(4000);
    const stranded = await prisma.outboundEmail.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(stranded.status).toBe('PROCESSING');
    expect(stranded.attempts).toBe(stranded.maxAttempts);
    fault('unpause');
    paused = false;
    advance(31 * 60_000);
    await mail.handleEmailQueue();
    const recovered = await prisma.outboundEmail.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(recovered.status).toBe('EXHAUSTED');
    expect(recovered.nextAttemptAt).toBeNull();
    expect(recovered.attempts).toBe(1);
    expect(await received()).toBe(baseline + 1);
    return {
      event: 'final-budget-double-completion-write-failure',
      writeFailureElapsedMs,
      terminal: recovered.status,
      attempts: recovered.attempts,
      smtpReceivedDelta: 1,
    };
  } finally {
    if (paused) fault('unpause');
    env.SMTP_PORT = oldPort;
    worker.onModuleDestroy();
    await proxy.stop();
  }
}
