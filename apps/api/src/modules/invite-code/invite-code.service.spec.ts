import { HARD_MATCH_KEYS } from '@lilink/shared';
import { InviteCodeService } from './invite-code.service';
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from './constants';

type MockTx = {
  inviteCode: {
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
  };
  auditLog: { create: jest.Mock };
  user: { findMany: jest.Mock };
};

function makeTxPrisma() {
  const tx: MockTx = {
    inviteCode: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((cb: (t: MockTx) => unknown) => cb(tx)),
  };
  return { prisma, tx };
}

describe('InviteCodeService', () => {
  beforeEach(() => jest.resetAllMocks());

  describe('createInviteCode', () => {
    it('creates a code with the expected format and writes audit in the same transaction', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.inviteCode.create.mockImplementation(
        ({ data }: { data: { code: string; ownerName: string } }) =>
          Promise.resolve({
            id: 'ic1',
            code: data.code,
            ownerName: data.ownerName,
            isActive: true,
            createdAt: new Date(),
          }),
      );
      const service = new InviteCodeService(prisma as never);

      const result = await service.createInviteCode('  张三  ', 'admin-1');

      expect(result.ownerName).toBe('张三');
      expect(result.code).toHaveLength(INVITE_CODE_LENGTH);
      expect(
        [...result.code].every((ch) => INVITE_CODE_ALPHABET.includes(ch)),
      ).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          adminActorId: 'admin-1',
          action: 'invite_code.create',
          metadata: { inviteCodeId: 'ic1' },
        },
      });
    });

    it('rejects an empty owner name', async () => {
      const { prisma } = makeTxPrisma();
      const service = new InviteCodeService(prisma as never);
      await expect(service.createInviteCode('   ', 'admin-1')).rejects.toThrow(
        'Owner name is required.',
      );
    });

    it('retries generation on a unique-collision (P2002)', async () => {
      const { prisma, tx } = makeTxPrisma();
      let calls = 0;
      tx.inviteCode.create.mockImplementation(
        ({ data }: { data: { code: string } }) => {
          calls += 1;
          if (calls === 1) {
            return Promise.reject(
              Object.assign(new Error('Unique constraint failed'), {
                code: 'P2002',
              }),
            );
          }
          return Promise.resolve({
            id: 'ic2',
            code: data.code,
            ownerName: 'x',
            isActive: true,
            createdAt: new Date(),
          });
        },
      );
      const service = new InviteCodeService(prisma as never);

      const result = await service.createInviteCode('x', 'admin-1');

      expect(calls).toBe(2);
      expect(result.id).toBe('ic2');
    });
  });

  describe('setInviteCodeActive', () => {
    it('updates active state with transactional audit', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.inviteCode.update.mockResolvedValue({
        id: 'ic1',
        code: 'ABCDEFGH',
        ownerName: 'x',
        isActive: false,
        createdAt: new Date(),
      });
      const service = new InviteCodeService(prisma as never);

      const result = await service.setInviteCodeActive('ic1', false, 'admin-1');

      expect(result.isActive).toBe(false);
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          adminActorId: 'admin-1',
          action: 'invite_code.set_active',
          metadata: { inviteCodeId: 'ic1', isActive: false },
        },
      });
    });

    it('maps a missing record (P2025) to NotFoundException', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.inviteCode.update.mockRejectedValue(
        Object.assign(new Error('Record not found'), { code: 'P2025' }),
      );
      const service = new InviteCodeService(prisma as never);
      await expect(
        service.setInviteCodeActive('missing', true, 'admin-1'),
      ).rejects.toThrow('Invite code not found.');
    });
  });

  describe('resolveActiveCodeId', () => {
    it('returns null for empty/whitespace input', async () => {
      const { prisma } = makeTxPrisma();
      const service = new InviteCodeService(prisma as never);
      expect(await service.resolveActiveCodeId(undefined)).toBeNull();
      expect(await service.resolveActiveCodeId('   ')).toBeNull();
    });

    it('normalizes input and returns id for an active code', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.inviteCode.findUnique.mockResolvedValue({ id: 'ic1', isActive: true });
      const service = new InviteCodeService(prisma as never);

      expect(await service.resolveActiveCodeId(' abcdefgh ')).toBe('ic1');
      expect(tx.inviteCode.findUnique).toHaveBeenCalledWith({
        where: { code: 'ABCDEFGH' },
      });
    });

    it('throws for a missing or inactive code', async () => {
      const { prisma, tx } = makeTxPrisma();
      const service = new InviteCodeService(prisma as never);

      tx.inviteCode.findUnique.mockResolvedValueOnce(null);
      await expect(service.resolveActiveCodeId('NOPE2345')).rejects.toThrow(
        'Invite code is invalid or inactive.',
      );

      tx.inviteCode.findUnique.mockResolvedValueOnce({
        id: 'ic2',
        isActive: false,
      });
      await expect(service.resolveActiveCodeId('OFF23456')).rejects.toThrow(
        'Invite code is invalid or inactive.',
      );
    });
  });

  describe('listInviteCodes', () => {
    it('buckets submitted genders, excludes test accounts, ignores drafts, defaults unknown', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.inviteCode.findMany.mockResolvedValue([
        {
          id: 'ic1',
          code: 'AAAA2345',
          ownerName: 'A',
          isActive: true,
          createdAt: new Date(),
        },
        {
          id: 'ic2',
          code: 'BBBB2345',
          ownerName: 'B',
          isActive: true,
          createdAt: new Date(),
        },
      ]);
      tx.inviteCode.count.mockResolvedValue(2);
      tx.user.findMany.mockResolvedValue([
        {
          inviteCodeId: 'ic1',
          questionnaireResponse: {
            submittedAt: new Date(),
            answers: { [HARD_MATCH_KEYS.gender]: '男' },
          },
        },
        {
          inviteCodeId: 'ic1',
          questionnaireResponse: {
            submittedAt: new Date(),
            answers: { [HARD_MATCH_KEYS.gender]: '女' },
          },
        },
        {
          inviteCodeId: 'ic1',
          questionnaireResponse: { submittedAt: null, answers: {} },
        },
        { inviteCodeId: 'ic1', questionnaireResponse: null },
      ]);
      const service = new InviteCodeService(prisma as never);

      const page = await service.listInviteCodes({});
      const ic1 = page.items.find((item) => item.id === 'ic1');
      const ic2 = page.items.find((item) => item.id === 'ic2');

      expect(ic1?.stats).toEqual({
        total: 4,
        male: 1,
        female: 1,
        nonBinary: 0,
        unknown: 2,
      });
      expect(ic2?.stats).toEqual({
        total: 0,
        male: 0,
        female: 0,
        nonBinary: 0,
        unknown: 0,
      });
      expect(tx.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isTest: false }) as object,
        }) as object,
      );
    });

    it('returns an empty page result without querying users', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.inviteCode.findMany.mockResolvedValue([]);
      tx.inviteCode.count.mockResolvedValue(0);
      const service = new InviteCodeService(prisma as never);

      const page = await service.listInviteCodes({ page: 1, pageSize: 20 });

      expect(page.items).toEqual([]);
      expect(page.totalPages).toBe(1);
      expect(tx.user.findMany).not.toHaveBeenCalled();
    });
  });
});
