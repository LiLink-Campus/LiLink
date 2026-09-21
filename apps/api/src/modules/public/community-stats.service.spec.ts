import { CommunityStatsService } from './community-stats.service';

describe('CommunityStatsService', () => {
  it('aggregates genders and schools without exposing the cross-tab or identities', async () => {
    const query = jest.fn().mockResolvedValue([
      { schoolId: 'a', schoolName: '甲大学', gender: '男', count: 2 },
      { schoolId: 'a', schoolName: '甲大学', gender: '女', count: 3 },
      { schoolId: 'b', schoolName: '乙大学', gender: '非二元', count: 1 },
      { schoolId: null, schoolName: null, gender: null, count: 4 },
    ]);
    const service = new CommunityStatsService({
      $queryRaw: query,
      school: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);
    const result = await service.getStats();
    expect(result).toMatchObject({
      total: 10,
      genders: { male: 2, female: 3, nonBinary: 1, unknown: 4 },
      schools: [
        { id: 'a', name: '甲大学', count: 5 },
        { id: null, name: '未关联学校', count: 4 },
        { id: 'b', name: '乙大学', count: 1 },
      ],
    });
    const calls = query.mock.calls as unknown as [{ strings: string[] }][];
    const sql = calls[0][0];
    expect(sql.strings.join('')).toContain('u."status" = \'ACTIVE\'');
    expect(sql.strings.join('')).toContain('u."deactivatedAt" IS NULL');
    expect(sql.strings.join('')).toContain('u."isTest" = false');
    expect(sql.strings.join('')).toContain('r."submittedAt" IS NOT NULL');
  });

  it('reloads the school name immediately after an admin change', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([
        { schoolId: 'a', schoolName: 'Before', gender: '男', count: 1 },
      ]);
    const service = new CommunityStatsService({
      $queryRaw: query,
      school: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);
    await service.getStats();
    query.mockResolvedValue([
      { schoolId: 'a', schoolName: 'After', gender: '男', count: 1 },
    ]);
    service.invalidateSchoolCache();
    expect((await service.getStats()).schools[0].name).toBe('After');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent loads, expires the cache and retries after failure', async () => {
    let now = 100;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const query = jest.fn().mockResolvedValue([]);
    try {
      const service = new CommunityStatsService({
        $queryRaw: query,
        school: { findMany: jest.fn().mockResolvedValue([]) },
      } as never);
      await Promise.all([service.getStats(), service.getStats()]);
      expect(query).toHaveBeenCalledTimes(1);
      now += 10001;
      query.mockRejectedValueOnce(new Error('offline'));
      await expect(service.getStats()).rejects.toThrow('offline');
      await expect(service.getStats()).resolves.toMatchObject({
        total: 0,
        schools: [],
        genders: { male: 0, female: 0, nonBinary: 0, unknown: 0 },
      });
      expect(query).toHaveBeenCalledTimes(3);
    } finally {
      clock.mockRestore();
    }
  });
});
