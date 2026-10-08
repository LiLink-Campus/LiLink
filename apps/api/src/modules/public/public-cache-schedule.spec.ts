import { PublicCacheSchedule } from './public-cache-schedule';

// Timer-only contracts: PostgreSQL and network clocks are never faked here.
describe('Public cache scheduling boundaries', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_800_000 }));
  afterEach(() => jest.useRealTimers());

  it('honors each recovery deadline, exhausts into degraded probes, and recovers automatically', async () => {
    let unavailable = true;
    const scan = jest.fn(() =>
      unavailable
        ? Promise.reject(new Error('unavailable'))
        : Promise.resolve({ value: 'published' }),
    );
    const schedule = new PublicCacheSchedule('boundary', () => true, scan);
    schedule.wake();
    await jest.advanceTimersByTimeAsync(25);
    for (const [index, delay] of [
      60_000, 120_000, 240_000, 300_000, 900_000,
    ].entries()) {
      const deadline = Date.now() + delay;
      expect(schedule.health()).toMatchObject({
        consecutiveFailures: index + 1,
        state: index === 4 ? 'degraded' : 'unknown',
        nextRecoveryAt: deadline,
      });
      schedule.wake();
      await schedule.run(true);
      expect(scan).toHaveBeenCalledTimes(index + 1);
      expect(schedule.health().nextRecoveryAt).toBe(deadline);
      await jest.advanceTimersByTimeAsync(delay - 1);
      expect(scan).toHaveBeenCalledTimes(index + 1);
      await jest.advanceTimersByTimeAsync(1);
      expect(scan).toHaveBeenCalledTimes(index + 2);
    }
    expect(schedule.health()).toMatchObject({
      state: 'degraded',
      consecutiveFailures: 6,
    });
    unavailable = false;
    await jest.advanceTimersByTimeAsync(899_999);
    expect(schedule.health().state).toBe('degraded');
    await jest.advanceTimersByTimeAsync(1);
    expect(schedule.health()).toMatchObject({
      state: 'healthy',
      consecutiveFailures: 0,
      nextRecoveryAt: null,
      outcome: 'published',
    });
    schedule.stop();
  });

  it('stays quiet until the aligned idle boundary, coalesces writes, and stops all timers', async () => {
    const scan = jest.fn(() => Promise.resolve({ value: 'idle' }));
    const schedule = new PublicCacheSchedule('idle', () => true, scan);
    schedule.wake();
    await jest.advanceTimersByTimeAsync(25);
    expect(schedule.health().nextRunAt).toBe(2_700_000);
    await jest.advanceTimersByTimeAsync(899_974);
    expect(scan).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(scan).toHaveBeenCalledTimes(2);
    schedule.wake();
    schedule.wake();
    await jest.advanceTimersByTimeAsync(25);
    expect(scan).toHaveBeenCalledTimes(3);
    schedule.stop();
    schedule.wake();
    await jest.advanceTimersByTimeAsync(1_800_000);
    expect(scan).toHaveBeenCalledTimes(3);
  });
});
