import { Prisma } from '../prisma/client';
import { MailService } from './mail.service';

export async function queueUnmatchedEmails(
  tx: Prisma.TransactionClient,
  cycleId: string,
  mail: MailService,
) {
  const participants = await tx.cycleParticipation.findMany({
    where: {
      cycleId,
      status: 'OPTED_IN',
      intent: { not: null },
      user: {
        status: 'ACTIVE',
        deactivatedAt: null,
        matchParticipants: { none: { cycleId } },
      },
    },
    select: { userId: true, user: { select: { email: true } } },
  });
  const emails = participants.map(({ userId, user }) =>
    mail.buildUnmatchedEmail({ cycleId, userId, email: user.email }),
  );
  if (emails.length)
    await tx.outboundEmail.createMany({ data: emails, skipDuplicates: true });
  return emails.map(({ dedupeKey }) => dedupeKey);
}
