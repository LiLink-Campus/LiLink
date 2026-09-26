import { DashboardSnapshotService } from './dashboard-snapshot.service';

describe('Dashboard snapshot payload compatibility', () => {
  it('returns only the current dashboard contract from historical snapshot JSON', () => {
    const service = new DashboardSnapshotService({} as never);
    const requestedAt = '2026-04-01T12:30:00.000Z';
    const stored = {
      id: 'historical-match',
      score: 88,
      introducedAt: requestedAt,
      currentUserRequestedAt: requestedAt,
      reportStatus: null,
      participants: [
        {
          userId: 'historical-user',
          displayName: 'Historical user',
          introLine: null,
          email: null,
          contact: {
            type: 'WECHAT',
            label: '微信',
            value: 'historical_wechat',
          },
          schoolName: null,
          contactRequestedAt: requestedAt,
        },
      ],
    };

    const result = service.readDashboardMatchPayload(stored);

    expect(result).toEqual({
      id: stored.id,
      score: stored.score,
      introducedAt: requestedAt,
      reportStatus: null,

      participants: [
        {
          userId: 'historical-user',
          displayName: 'Historical user',
          introLine: null,
          email: null,
          contact: stored.participants[0].contact,
          schoolName: null,
          gender: null,
          partnerGenders: [],
          weeklyIntent: null,
        },
      ],
    });
    expect(stored.currentUserRequestedAt).toBe(requestedAt);
    expect(stored.participants[0].contactRequestedAt).toBe(requestedAt);
  });

  it.each([null, undefined])(
    'hides cached pairs without an introduction timestamp (%s)',
    (introducedAt) => {
      const service = new DashboardSnapshotService({} as never);
      const stored = {
        id: 'skipped-match',
        score: 88,
        ...(introducedAt === null ? { introducedAt } : {}),
        participants: [
          {
            userId: 'suspended-user',
            email: 'private@example.test',
            contact: { type: 'WECHAT', label: '微信', value: 'private_wechat' },
          },
        ],
      };

      const result = service.readDashboardMatchPayload(stored);

      expect(result).toBeNull();
      expect(JSON.stringify(result)).not.toContain('private');
      expect(stored.participants[0].contact.value).toBe('private_wechat');
    },
  );
});
