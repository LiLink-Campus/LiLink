import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PublicService } from '../public/public.service';

@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: DashboardSnapshotService,
    private readonly publicService: PublicService,
  ) {}

  async deleteAccount(userId: string, password: string) {
    await this.prisma.$transaction(
      async (tx) => {
        // Allow snapshot foreign-key checks until all match locks are acquired.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (
          !user ||
          user.deactivatedAt ||
          user.status !== 'ACTIVE' ||
          !(await argon2.verify(user.passwordHash, password))
        ) {
          throw new UnauthorizedException('密码不正确，账号未注销。');
        }
        const now = new Date();
        const participants = await tx.matchParticipant.findMany({
          where: { userId },
          select: { matchId: true },
          orderBy: { matchId: 'asc' },
        });
        const matchIds = participants.map((item) => item.matchId);
        for (const matchId of matchIds) {
          await tx.$queryRaw`SELECT "id" FROM "Match" WHERE "id" = ${matchId} FOR UPDATE`;
        }
        // Preserve the original address for audit while freeing its unique login slot.
        await tx.user.update({
          where: { id: userId },
          data: {
            deactivatedAt: now,
            deactivatedEmail: user.email,
            email: `deactivated-${userId}@accounts.invalid`,
            status: 'SUSPENDED',
          },
        });
        await tx.emailCode.updateMany({
          where: { email: user.email, consumedAt: null },
          data: { consumedAt: now },
        });
        await tx.outboundEmail.updateMany({
          where: {
            status: { in: ['PENDING', 'FAILED', 'PROCESSING'] },
            OR: [
              { recipientEmail: user.email },
              ...matchIds.flatMap((matchId) => [
                { dedupeKey: { startsWith: `match-reveal:${matchId}:` } },
                { dedupeKey: { startsWith: `match-introduction:${matchId}:` } },
              ]),
            ],
          },
          data: {
            status: 'EXHAUSTED',
            nextAttemptAt: null,
            errorMessage: 'Account deactivated before delivery.',
          },
        });
        for (const matchId of matchIds)
          await this.snapshots.syncMatchSnapshots(matchId, tx);
        await tx.auditLog.create({
          data: { actorId: userId, action: 'account.deactivated' },
        });
      },
      { timeout: 30_000 },
    );
    this.publicService.invalidateLandingCache();
    return { ok: true };
  }
}
