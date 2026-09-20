import { randomBytes, randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  hashVipCode,
  VipService,
  VIP_DURATION_MS,
} from '../src/modules/vip/vip.service';
import { revokeVipCodes } from '../src/modules/vip/vip-revocation';

const batch = `vip-test-${randomUUID()}`;

describe('VIP activation (isolated PostgreSQL)', () => {
  let prisma: PrismaClient;
  let vip: VipService;
  const ids: string[] = [];
  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL!);
    if (
      !['127.0.0.1', 'localhost'].includes(database.hostname) ||
      !database.pathname.startsWith('/lilink_vip_test_')
    ) {
      throw new Error(
        'VIP tests require a dedicated local lilink_vip_test_* database.',
      );
    }
    prisma = createPrismaClient();
    vip = new VipService(prisma as PrismaService);
    await prisma.$connect();
  });
  afterAll(async () => {
    if (!prisma) return;
    await prisma.vipActivation.deleteMany({ where: { batch } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: ids } },
          {
            action: 'VIP_CODES_REVOKED',
            metadata: { path: ['batch'], equals: batch },
          },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  async function user() {
    const result = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        passwordHash: 'synthetic-unusable',
        status: 'ACTIVE',
      },
    });
    ids.push(result.id);
    return result.id;
  }
  async function code() {
    const raw = randomBytes(12).toString('hex').toUpperCase();
    await prisma.vipActivation.create({
      data: { codeHash: hashVipCode(raw), batch },
    });
    return raw;
  }
  it('starts at activation, persists across reloads and never extends on retries', async () => {
    const id = await user();
    const secret = await code();
    const before = Date.now();
    const result = await vip.activate(id, secret);
    expect(result.active).toBe(true);
    expect(result.activatedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.expiresAt!.getTime() - result.activatedAt!.getTime()).toBe(
      VIP_DURATION_MS,
    );
    expect(await vip.activate(id, secret)).toEqual(result);
    expect(await vip.getStatus(id)).toEqual(result);
  });
  it('allows only one winner when two accounts redeem the same code', async () => {
    const [a, b, secret] = await Promise.all([user(), user(), code()]);
    const results = await Promise.allSettled([
      vip.activate(a, secret),
      vip.activate(b, secret),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it('extends membership for each new code even when redeemed concurrently', async () => {
    const [id, a, b] = await Promise.all([user(), code(), code()]);
    const results = await Promise.allSettled([
      vip.activate(id, a),
      vip.activate(id, b),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    const grants = await prisma.vipActivation.findMany({
      where: { userId: id },
      orderBy: { expiresAt: 'asc' },
    });
    expect(
      grants[1].expiresAt!.getTime() - grants[0].expiresAt!.getTime(),
    ).toBe(VIP_DURATION_MS);
    expect(
      grants[1].expiresAt!.getTime() - grants[0].activatedAt!.getTime(),
    ).toBe(2 * VIP_DURATION_MS);
    const beforeRetry = await vip.getStatus(id);
    expect(await vip.activate(id, a)).toEqual(beforeRetry);
    const unused = await prisma.vipActivation.count({
      where: {
        codeHash: { in: [hashVipCode(a), hashVipCode(b)] },
        userId: null,
      },
    });
    expect(unused).toBe(0);
  });
  it('expires without a scheduled job; an old code cannot reactivate membership', async () => {
    const id = await user();
    const secret = await code();
    await vip.activate(id, secret);
    await prisma.vipActivation.update({
      where: { codeHash: hashVipCode(secret) },
      data: {
        activatedAt: new Date(Date.now() - VIP_DURATION_MS - 1000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    expect((await vip.getStatus(id)).active).toBe(false);
    expect((await vip.activate(id, secret)).active).toBe(false);
    expect((await vip.activate(id, await code())).active).toBe(true);
  });
  it('revocation blocks unused codes and immediately removes active membership', async () => {
    const id = await user();
    const unused = await code();
    await prisma.vipActivation.update({
      where: { codeHash: hashVipCode(unused) },
      data: { revokedAt: new Date() },
    });
    await expect(vip.activate(id, unused)).rejects.toThrow('停用');
    const active = await code();
    await vip.activate(id, active);
    await prisma.vipActivation.update({
      where: { codeHash: hashVipCode(active) },
      data: { revokedAt: new Date() },
    });
    expect((await vip.getStatus(id)).active).toBe(false);
    await expect(vip.activate(id, active)).rejects.toThrow('停用');
  });
  it('rejects an unavailable account and invalid code without consuming inventory', async () => {
    const id = await user();
    const secret = await code();
    await expect(vip.activate(id, 'Z'.repeat(24))).rejects.toThrow('无效');
    await prisma.user.update({ where: { id }, data: { status: 'SUSPENDED' } });
    await expect(vip.activate(id, secret)).rejects.toThrow('账号不可用');
    expect(
      (
        await prisma.vipActivation.findUniqueOrThrow({
          where: { codeHash: hashVipCode(secret) },
        })
      ).userId,
    ).toBeNull();
  });

  it('revokes a partially consumed card while preserving every remaining renewal', async () => {
    const [id, a, b, c] = await Promise.all([user(), code(), code(), code()]);
    const day = VIP_DURATION_MS / 30;
    const start = Date.now() - 10 * day;
    for (const [index, raw] of [a, b, c].entries()) {
      await prisma.vipActivation.update({
        where: { codeHash: hashVipCode(raw) },
        data: {
          userId: id,
          activatedAt: new Date(start),
          expiresAt: new Date(start + (index + 1) * VIP_DURATION_MS),
        },
      });
    }
    const before = Date.now();
    const manifest = { batch, hashes: [hashVipCode(a)] };
    expect(await revokeVipCodes(prisma, manifest)).toEqual({ count: 1 });
    const status = await vip.getStatus(id);
    expect(status.expiresAt!.getTime()).toBeGreaterThanOrEqual(
      before + 2 * VIP_DURATION_MS,
    );
    expect(status.expiresAt!.getTime()).toBeLessThanOrEqual(
      Date.now() + 2 * VIP_DURATION_MS,
    );
    expect(await revokeVipCodes(prisma, manifest)).toEqual({ count: 0 });
    expect(await vip.getStatus(id)).toEqual(status);
    await expect(vip.activate(id, a)).rejects.toThrow('停用');
  });

  it('revokes future renewals without shortening the active card', async () => {
    const [id, a, b, c] = await Promise.all([user(), code(), code(), code()]);
    const first = await vip.activate(id, a);
    await vip.activate(id, b);
    await vip.activate(id, c);
    expect(
      await revokeVipCodes(prisma, { batch, hashes: [b, c].map(hashVipCode) }),
    ).toEqual({ count: 2 });
    expect((await vip.getStatus(id)).expiresAt).toEqual(first.expiresAt);
  });

  it('does not deduct an expired card from a later active card', async () => {
    const [id, a, b] = await Promise.all([user(), code(), code()]);
    await prisma.vipActivation.update({
      where: { codeHash: hashVipCode(a) },
      data: {
        userId: id,
        activatedAt: new Date(Date.now() - VIP_DURATION_MS - 1000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const current = await vip.activate(id, b);
    await revokeVipCodes(prisma, { batch, hashes: [hashVipCode(a)] });
    expect(await vip.getStatus(id)).toEqual(current);
  });

  it('serializes renewal and revocation for the same account', async () => {
    const [id, a, b, c] = await Promise.all([user(), code(), code(), code()]);
    await vip.activate(id, a);
    await vip.activate(id, b);
    const before = Date.now();
    await Promise.all([
      vip.activate(id, c),
      revokeVipCodes(prisma, { batch, hashes: [hashVipCode(a)] }),
    ]);
    const status = await vip.getStatus(id);
    expect(status.expiresAt!.getTime()).toBeGreaterThanOrEqual(
      before + 2 * VIP_DURATION_MS,
    );
    expect(status.expiresAt!.getTime()).toBeLessThanOrEqual(
      Date.now() + 2 * VIP_DURATION_MS,
    );
    expect(
      await prisma.vipActivation.count({
        where: { userId: id, revokedAt: null },
      }),
    ).toBe(2);
  });

  it('retries if an unused target is claimed between discovery and its row lock', async () => {
    const [id, a, b] = await Promise.all([user(), code(), code()]);
    let interleaved = false;
    const observed = prisma.$extends({
      query: {
        vipActivation: {
          async findMany({ args, query }) {
            const result = await query(args);
            if (
              !interleaved &&
              args.select?.userId &&
              args.where?.batch === batch
            ) {
              interleaved = true;
              await vip.activate(id, a);
              await vip.activate(id, b);
            }
            return result;
          },
        },
      },
    });
    const before = Date.now();
    await revokeVipCodes(observed as unknown as PrismaClient, {
      batch,
      hashes: [hashVipCode(a)],
    });
    expect(interleaved).toBe(true);
    const status = await vip.getStatus(id);
    expect(status.expiresAt!.getTime()).toBeGreaterThanOrEqual(
      before + VIP_DURATION_MS,
    );
    expect(status.expiresAt!.getTime()).toBeLessThanOrEqual(
      Date.now() + VIP_DURATION_MS,
    );
    expect(
      await prisma.vipActivation.count({
        where: { userId: id, revokedAt: null },
      }),
    ).toBe(1);
  });

  it('rejects activation when revocation wins the unused code row lock', async () => {
    const [id, raw] = await Promise.all([user(), code()]);
    let activation: Promise<unknown> | undefined;
    let attemptingClaim!: () => void;
    const claimStarted = new Promise<void>((resolve) => {
      attemptingClaim = resolve;
    });
    const contender = prisma.$extends({
      query: {
        vipActivation: {
          async updateMany({ args, query }) {
            attemptingClaim();
            return query(args);
          },
        },
      },
    });
    const activating = new VipService(contender as unknown as PrismaService);
    const revoking = prisma.$extends({
      query: {
        async $queryRaw({ args, query }) {
          const result: unknown = await query(args);
          if (!activation) {
            activation = activating
              .activate(id, raw)
              .catch((error: unknown) => error);
            await claimStarted;
          }
          return result;
        },
      },
    });
    await revokeVipCodes(revoking as unknown as PrismaClient, {
      batch,
      hashes: [hashVipCode(raw)],
    });
    const error = await activation;
    expect(error).toBeInstanceOf(Error);
    expect(error instanceof Error ? error.message : '').toContain('停用');
    expect((await vip.getStatus(id)).active).toBe(false);
    const grant = await prisma.vipActivation.findUniqueOrThrow({
      where: { codeHash: hashVipCode(raw) },
    });
    expect(grant.userId).toBeNull();
    expect(grant.revokedAt).not.toBeNull();
  });
});
