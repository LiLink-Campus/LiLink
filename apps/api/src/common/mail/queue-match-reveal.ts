import { contactChannelLabel, readQuestionnaireOneLiner } from '@lilink/shared';
import { Prisma, type ContactChannelType } from '../prisma/client';
import { MailService } from './mail.service';

export async function queueMatchRevealEmails(
  tx: Prisma.TransactionClient,
  cycleId: string,
  revealedAt: Date,
  mailService: MailService,
) {
  const matches = await tx.match.findMany({
    where: { cycleId, revealedAt, introducedAt: null },
    include: {
      participants: {
        orderBy: { userId: 'asc' },
        include: {
          user: {
            include: {
              profile: true,
              school: true,
              questionnaireResponse: { select: { answers: true } },
            },
          },
        },
      },
    },
  });
  if (matches.length === 0) return [];
  const userIds = matches.flatMap((match) =>
    match.participants.map((p) => p.userId),
  );
  // One statement keeps the channel and value on the same MVCC snapshot.
  const contacts =
    userIds.length === 0
      ? []
      : await tx.$queryRaw<
          {
            userId: string;
            email: string;
            preferredContactChannel: ContactChannelType;
            value: string | null;
          }[]
        >(Prisma.sql`
    SELECT u."id" AS "userId", u."email", u."preferredContactChannel",
      method."value"
    FROM "User" u
    LEFT JOIN "UserContactMethod" method
      ON method."userId" = u."id"
      AND method."type" = u."preferredContactChannel"
    WHERE u."id" IN (${Prisma.join(userIds)})
  `);
  const contactByUserId = new Map(
    contacts.map((contact) => [contact.userId, contact]),
  );
  const blocks = await tx.block.findMany({
    where: { blockerId: { in: userIds }, blockedId: { in: userIds } },
    select: { blockerId: true, blockedId: true },
  });
  const blockedPairs = new Set(
    blocks.map((b) => JSON.stringify([b.blockerId, b.blockedId].sort())),
  );
  const participations = await tx.cycleParticipation.findMany({
    where: {
      cycleId,
      userId: { in: userIds },
      status: 'OPTED_IN',
      intent: { not: null },
    },
    select: { userId: true, intent: true },
  });
  const intents = new Map(participations.map((p) => [p.userId, p.intent]));
  const matchIds: string[] = [];
  const contactRows: Prisma.Sql[] = [];
  const emails: ReturnType<MailService['buildMatchRevealEmails']> = [];
  for (const match of matches) {
    const issues = match.participants.flatMap((participant) => {
      const reasons: string[] = [];
      if (participant.user.deactivatedAt) reasons.push('ACCOUNT_DEACTIVATED');
      if (participant.user.status !== 'ACTIVE')
        reasons.push(participant.user.status);
      if (!intents.has(participant.userId))
        reasons.push('NOT_ELIGIBLE_FOR_CYCLE');
      return reasons.map((reason) => ({ userId: participant.userId, reason }));
    });
    const pairKey = JSON.stringify(
      match.participants.map((p) => p.userId).sort(),
    );
    const reason =
      match.participants.length !== 2
        ? 'INVALID_PARTICIPANTS'
        : issues.length > 0
          ? 'INELIGIBLE_PARTICIPANT'
          : blockedPairs.has(pairKey)
            ? 'BLOCKED'
            : null;
    if (reason) {
      await tx.auditLog.create({
        data: {
          action: 'match.introduction_skipped',
          metadata: { cycleId, matchId: match.id, reason, issues },
        },
      });
      continue;
    }
    const parties = match.participants.map(
      ({ user, userId, id, profileSnapshot }) => {
        const contact = contactByUserId.get(userId);
        if (!contact)
          throw new Error('Match participant contact is unavailable.');
        const preferred = contact.preferredContactChannel;
        const type: ContactChannelType =
          preferred !== 'EMAIL' && contact.value?.trim() ? preferred : 'EMAIL';
        const value = type === 'EMAIL' ? contact.email : contact.value!;
        contactRows.push(Prisma.sql`(${id}, ${type}, ${value})`);
        return {
          email: contact.email,
          displayName: user.displayName,
          schoolName: user.school?.name ?? null,
          introLine:
            profileSnapshot &&
            typeof profileSnapshot === 'object' &&
            !Array.isArray(profileSnapshot)
              ? typeof profileSnapshot.introLine === 'string'
                ? profileSnapshot.introLine
                : null
              : (readQuestionnaireOneLiner(
                  user.questionnaireResponse?.answers,
                ) ??
                user.profile?.headline ??
                null),
          publicContact: { type, label: contactChannelLabel(type), value },
          weeklyIntent: intents.get(userId) ?? null,
        };
      },
    );
    matchIds.push(match.id);
    emails.push(
      ...mailService.buildMatchRevealEmails({
        matchId: match.id,
        requester: parties[0],
        recipient: parties[1],
      }),
    );
  }
  if (matchIds.length === 0) return [];
  await tx.match.updateMany({
    where: { id: { in: matchIds } },
    data: { introducedAt: revealedAt },
  });
  for (let offset = 0; offset < contactRows.length; offset += 500) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "MatchParticipant" AS participant
      SET "introducedContactType" = contact.channel::"ContactChannelType",
          "introducedContactValue" = contact.value
      FROM (VALUES ${Prisma.join(contactRows.slice(offset, offset + 500))}) AS contact(id, channel, value)
      WHERE participant.id = contact.id
    `);
  }
  await tx.outboundEmail.createMany({ data: emails, skipDuplicates: true });
  return emails.map((email) => email.dedupeKey);
}
