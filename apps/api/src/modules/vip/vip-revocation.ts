import { Prisma, type PrismaClient } from '../../common/prisma/client';
import { VIP_DURATION_MS } from './vip.service';

type Grant = { id: string; expiresAt: Date };

export function planVipRevocation(
  grants: Grant[],
  revokedIds: ReadonlySet<string>,
  now: Date,
) {
  let removedMs = 0;
  const updates: Grant[] = [];
  for (const grant of [...grants].sort(
    (a, b) => a.expiresAt.getTime() - b.expiresAt.getTime(),
  )) {
    const end = grant.expiresAt.getTime();
    if (revokedIds.has(grant.id)) {
      // Each card contributes its own 30-day interval, not the cumulative term.
      removedMs += Math.max(
        0,
        end - Math.max(now.getTime(), end - VIP_DURATION_MS),
      );
    } else if (removedMs > 0) {
      updates.push({ id: grant.id, expiresAt: new Date(end - removedMs) });
    }
  }
  return updates;
}

export async function revokeVipCodes(
  prisma: PrismaClient,
  manifest: { batch: string; hashes: string[] },
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await prisma.$transaction(
      async (tx) => {
        const where = {
          codeHash: { in: manifest.hashes },
          batch: manifest.batch,
          revokedAt: null,
        };
        const candidates = await tx.vipActivation.findMany({
          where,
          select: { id: true, userId: true },
        });
        const userIds = [
          ...new Set(
            candidates.flatMap((code) => (code.userId ? [code.userId] : [])),
          ),
        ].sort();
        // Match activation's user-before-code lock order, including retries.
        for (const userId of userIds) {
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
        }
        const locked: {
          id: string;
          userId: string | null;
          revokedAt: Date | null;
        }[] = [];
        for (const codeId of candidates.map((code) => code.id).sort()) {
          const [code] = await tx.$queryRaw<
            { id: string; userId: string | null; revokedAt: Date | null }[]
          >`SELECT "id", "userId", "revokedAt" FROM "VipActivation"
            WHERE "id" = ${codeId} FOR UPDATE`;
          if (!code) continue;
          // Check each row immediately: an unknown owner can be reflowing
          // another target, so waiting for all targets first could deadlock.
          if (code.userId && !userIds.includes(code.userId)) return null;
          locked.push(code);
        }
        const revokedIds = new Set(
          locked.filter((code) => !code.revokedAt).map((code) => code.id),
        );
        const now = new Date();
        for (const userId of userIds) {
          const grants = await tx.vipActivation.findMany({
            where: { userId, revokedAt: null, expiresAt: { gt: now } },
            select: { id: true, expiresAt: true },
          });
          const periods = grants.flatMap((grant) =>
            grant.expiresAt
              ? [{ id: grant.id, expiresAt: grant.expiresAt }]
              : [],
          );
          for (const update of planVipRevocation(periods, revokedIds, now)) {
            await tx.vipActivation.update({
              where: { id: update.id },
              data: { expiresAt: update.expiresAt },
            });
          }
        }
        const changed = await tx.vipActivation.updateMany({
          where: { id: { in: [...revokedIds] } },
          data: { revokedAt: now },
        });
        await tx.auditLog.create({
          data: {
            action: 'VIP_CODES_REVOKED',
            metadata: {
              batch: manifest.batch,
              count: changed.count,
              source: 'operator-cli',
            },
          },
        });
        return changed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    if (result) return result;
  }
  throw new Error(
    'VIP code ownership changed repeatedly. Retry the revocation.',
  );
}
