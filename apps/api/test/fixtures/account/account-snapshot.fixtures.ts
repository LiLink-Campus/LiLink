export function createDashboardSnapshotServiceMock() {
  return {
    ensureUserSnapshotCoverage: jest.fn().mockResolvedValue(undefined),
    readDashboardMatchPayload: jest
      .fn()
      .mockImplementation((rawPayload: unknown) =>
        typeof rawPayload === 'object' && rawPayload !== null
          ? rawPayload
          : null,
      ),
    syncMatchSnapshots: jest.fn().mockResolvedValue(undefined),
    syncUserMatchSnapshots: jest.fn().mockResolvedValue(undefined),
    syncUserDisplayNameSnapshots: jest.fn().mockResolvedValue(undefined),
  };
}
