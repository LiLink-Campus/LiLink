import { randomUUID } from 'crypto';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AdminService } from '../src/modules/admin/admin.service';

const tag = `admin-profile-${randomUUID()}`;

describe('Admin profile editing (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let admin: AdminService;
  const audit = { write: jest.fn() };
  const snapshots = { syncUserMatchSnapshots: jest.fn() };

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    admin = new AdminService(
      prisma as PrismaService,
      {} as never,
      audit as never,
      {} as never,
      snapshots as never,
    );
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: `@${tag}.test` } },
    });
    await prisma.$disconnect();
  });

  it.each([false, true])(
    'saves, reads and clears fields with existing profile=%s',
    async (existing) => {
      const user = await prisma.user.create({
        data: {
          email: `${existing}@${tag}.test`,
          passwordHash: 'unused-test-hash',
          status: 'ACTIVE',
          ...(existing
            ? { profile: { create: { fullName: 'Preserved name' } } }
            : {}),
        },
      });
      const fields = {
        headline: 'Safari and Chrome profile edit',
        bio: 'Synthetic profile',
        schoolYear: '研一',
        programName: '产品设计',
      };
      const response = await admin.updateUser(user.id, fields, 'test-admin');
      expect(response).not.toHaveProperty('passwordHash');
      expect(
        await prisma.userProfile.findUnique({ where: { userId: user.id } }),
      ).toMatchObject({
        ...fields,
        fullName: existing ? 'Preserved name' : null,
      });
      expect(audit.write).toHaveBeenLastCalledWith(
        'test-admin',
        'user.updated',
        {
          userId: user.id,
          fields: expect.arrayContaining(Object.keys(fields)) as string[],
        },
      );
      expect(snapshots.syncUserMatchSnapshots).toHaveBeenLastCalledWith(
        user.id,
      );
      await admin.updateUser(
        user.id,
        { displayName: 'Updated name', headline: null, bio: null },
        'test-admin',
      );
      expect(
        await prisma.user.findUnique({
          where: { id: user.id },
          include: { profile: true },
        }),
      ).toMatchObject({
        displayName: 'Updated name',
        profile: {
          headline: null,
          bio: null,
          schoolYear: '研一',
          programName: '产品设计',
        },
      });
    },
  );

  it('does not recreate profile data for a deactivated user', async () => {
    const user = await prisma.user.create({
      data: {
        email: `deactivated@${tag}.test`,
        passwordHash: 'unused-test-hash',
        deactivatedAt: new Date(),
        status: 'SUSPENDED',
      },
    });
    await expect(
      admin.updateUser(user.id, { headline: 'Must not save' }, 'test-admin'),
    ).rejects.toThrow('Deactivated accounts');
    expect(
      await prisma.userProfile.findUnique({ where: { userId: user.id } }),
    ).toBeNull();
  });
});
