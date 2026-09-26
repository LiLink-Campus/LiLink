import { BadRequestException } from '@nestjs/common';
import { createDashboardSnapshotServiceMock } from '../../../test/fixtures/account/account-snapshot.fixtures';
import { MatchReportService } from './match-report.service';
describe('MatchReportService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it('creates only a one-way block when a match is reported', async () => {
    const reportCreate = jest.fn().mockResolvedValue(undefined);
    const blockUpsert = jest.fn().mockResolvedValue(undefined);
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      matchParticipant: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'participant-1',
            userId: 'user-1',
            match: {
              id: 'match-1',
              revealedAt: new Date('2026-05-08T12:00:00.000Z'),
              reasons: ['reason'],
              participants: [
                {
                  userId: 'user-1',
                  user: {
                    email: 'user-1@example.com',
                    displayName: 'User 1',
                    profile: { headline: 'hello' },
                    school: { name: 'School A' },
                  },
                },
                {
                  userId: 'user-2',
                  user: {
                    email: 'user-2@example.com',
                    displayName: 'User 2',
                    profile: { headline: 'world' },
                    school: { name: 'School B' },
                  },
                },
              ],
            },
          })
          .mockResolvedValueOnce({
            id: 'participant-2',
            userId: 'user-2',
            match: {
              id: 'match-1',
              reasons: ['reason'],
            },
          }),
      },
      report: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: reportCreate,
      },
      block: {
        upsert: blockUpsert,
      },
      auditLog: {
        create: auditLogCreate,
      },
      userCycleDashboardSnapshot: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: (tx: unknown) => Promise<unknown>) =>
            callback({
              $queryRaw: jest.fn().mockResolvedValue([{ id: 'match-1' }]),
              outboundEmail: {
                updateMany: jest.fn().mockResolvedValue({ count: 2 }),
              },
              report: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: reportCreate,
              },
              block: {
                upsert: blockUpsert,
              },
              auditLog: {
                create: auditLogCreate,
              },
            }),
        ),
    };
    const dashboardSnapshotService = createDashboardSnapshotServiceMock();
    const service = new MatchReportService(
      prisma as never,
      dashboardSnapshotService as never,
    );

    await expect(
      service.reportMatch('user-1', 'match-1', { reason: '骚扰' }),
    ).resolves.toEqual({ ok: true });

    expect(reportCreate).toHaveBeenCalledWith({
      data: {
        reporterId: 'user-1',
        reportedUserId: 'user-2',
        matchId: 'match-1',
        reason: '骚扰',
        details: undefined,
        createdBlock: true,
      },
    });
    expect(blockUpsert).toHaveBeenCalledTimes(1);
    expect(blockUpsert).toHaveBeenCalledWith({
      where: {
        blockerId_blockedId: {
          blockerId: 'user-1',
          blockedId: 'user-2',
        },
      },
      update: {},
      create: {
        blockerId: 'user-1',
        blockedId: 'user-2',
      },
    });
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: {
        actorId: 'user-1',
        action: 'match.reported',
        metadata: {
          matchId: 'match-1',
          reportedUserId: 'user-2',
          reason: '骚扰',
        },
      },
    });
    expect(dashboardSnapshotService.syncMatchSnapshots).toHaveBeenCalledWith(
      'match-1',
      expect.objectContaining<{
        report: unknown;
        block: unknown;
        auditLog: unknown;
      }>({
        report: expect.objectContaining({ create: reportCreate }),
        block: expect.objectContaining({ upsert: blockUpsert }),
        auditLog: expect.objectContaining({ create: auditLogCreate }),
      }),
    );
  });
  it('rechecks an open report after locking the match row', async () => {
    const reportCreate = jest.fn().mockResolvedValue(undefined);
    const transactionReportFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 'report-1' });
    const prisma = {
      matchParticipant: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'participant-1',
            userId: 'user-1',
            match: {
              id: 'match-1',
              revealedAt: new Date('2026-05-08T12:00:00.000Z'),
            },
          })
          .mockResolvedValueOnce({
            id: 'participant-2',
            userId: 'user-2',
          }),
      },
      report: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: reportCreate,
      },
      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: (tx: unknown) => Promise<unknown>) =>
            callback({
              $queryRaw: jest.fn().mockResolvedValue([{ id: 'match-1' }]),
              outboundEmail: {
                updateMany: jest.fn().mockResolvedValue({ count: 2 }),
              },
              report: {
                findFirst: transactionReportFindFirst,
                create: reportCreate,
              },
              block: {
                upsert: jest.fn().mockResolvedValue(undefined),
              },
              auditLog: {
                create: jest.fn().mockResolvedValue(undefined),
              },
            }),
        ),
    };
    const dashboardSnapshotService = createDashboardSnapshotServiceMock();
    const service = new MatchReportService(
      prisma as never,
      dashboardSnapshotService as never,
    );

    await expect(
      service.reportMatch('user-1', 'match-1', { reason: 'spam' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transactionReportFindFirst).toHaveBeenCalledWith({
      where: {
        reporterId: 'user-1',
        matchId: 'match-1',
        status: 'OPEN',
      },
    });
    expect(reportCreate).not.toHaveBeenCalled();
    expect(dashboardSnapshotService.syncMatchSnapshots).not.toHaveBeenCalled();
  });
});
