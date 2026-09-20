import { randomUUID } from 'crypto';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AccountService } from '../src/modules/account/account.service';

describe('Contact preferences concurrency (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let account: AccountService;
  const userIds: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    account = new AccountService(
      prisma as PrismaService,
      {} as never,
      {} as never,
    );
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function seedUser() {
    const user = await prisma.user.create({
      data: {
        email: `contact-revision-${randomUUID()}@example.test`,
        passwordHash: 'synthetic-unused-hash',
        status: 'ACTIVE',
        isTest: true,
      },
    });
    userIds.push(user.id);
    return user;
  }

  function payload(value: string, revision = 0) {
    return {
      revision,
      preferredContactChannel: 'WECHAT' as const,
      methods: [{ type: 'WECHAT' as const, value }],
    };
  }

  it('allows only one concurrent writer for the same revision', async () => {
    const user = await seedUser();
    const results = await Promise.allSettled([
      account.updateContactPreferences(user.id, payload('first_tab')),
      account.updateContactPreferences(user.id, payload('second_tab')),
    ]);
    const successful = results.filter(
      (result) => result.status === 'fulfilled',
    );
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ reason: { status: 409 } });
    const stored = await account.getContactPreferences(user.id);
    expect(stored.revision).toBe(1);
    expect(successful[0]).toMatchObject({ value: stored });
  });

  it('does not let an old page overwrite a newer save and permits an explicit retry', async () => {
    const user = await seedUser();
    const oldPage = await account.getContactPreferences(user.id);
    const newPage = await account.getContactPreferences(user.id);
    await account.updateContactPreferences(
      user.id,
      payload('new_page', newPage.revision),
    );
    await expect(
      account.updateContactPreferences(
        user.id,
        payload('old_page', oldPage.revision),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const current = await account.getContactPreferences(user.id);
    expect(current).toMatchObject({
      revision: 1,
      methods: [{ type: 'WECHAT', value: 'new_page' }],
    });
    await account.updateContactPreferences(
      user.id,
      payload('explicit_retry', current.revision),
    );
    expect(await account.getContactPreferences(user.id)).toMatchObject({
      revision: 2,
      methods: [{ type: 'WECHAT', value: 'explicit_retry' }],
    });
  });

  it('rejects an in-flight request from a deactivated account', async () => {
    const user = await seedUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { deactivatedAt: new Date(), status: 'SUSPENDED' },
    });
    await expect(
      account.updateContactPreferences(user.id, payload('stale_account')),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await prisma.userContactMethod.count({ where: { userId: user.id } }),
    ).toBe(0);
    expect((await account.getContactPreferences(user.id)).revision).toBe(0);
  });
});
