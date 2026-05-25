import {
  computeLeaderboardMetrics,
  UserCycleOutcome,
} from './leaderboard-metrics';

function outcome(day: number, matched: boolean): UserCycleOutcome {
  const d = new Date(2026, 0, day);
  return {
    cycleId: `c${day}`,
    revealAt: d,
    cycleCreatedAt: d,
    participationUpdatedAt: d,
    matched,
  };
}

describe('computeLeaderboardMetrics', () => {
  it('returns zeros for no outcomes', () => {
    expect(computeLeaderboardMetrics([])).toEqual({
      optInRounds: 0,
      matchedRounds: 0,
      matchRate: null,
      currentMatchStreak: 0,
      currentUnmatchedStreak: 0,
    });
  });

  it('counts rounds and rate regardless of input order', () => {
    const m = computeLeaderboardMetrics([
      outcome(1, true),
      outcome(3, false),
      outcome(2, true),
    ]);
    expect(m.optInRounds).toBe(3);
    expect(m.matchedRounds).toBe(2);
    expect(m.matchRate).toBeCloseTo(2 / 3);
  });

  it('current unmatched streak counts back from most recent until a match', () => {
    const m = computeLeaderboardMetrics([
      outcome(3, true),
      outcome(4, false),
      outcome(5, false),
      outcome(2, true),
    ]);
    expect(m.currentUnmatchedStreak).toBe(2);
    expect(m.currentMatchStreak).toBe(0);
  });

  it('current match streak counts back from most recent until an unmatch', () => {
    const m = computeLeaderboardMetrics([
      outcome(5, true),
      outcome(4, true),
      outcome(3, false),
    ]);
    expect(m.currentMatchStreak).toBe(2);
    expect(m.currentUnmatchedStreak).toBe(0);
  });

  it('handles all matched and all unmatched outcomes', () => {
    expect(
      computeLeaderboardMetrics([outcome(1, true), outcome(2, true)]),
    ).toMatchObject({
      currentMatchStreak: 2,
      currentUnmatchedStreak: 0,
      matchRate: 1,
    });
    expect(
      computeLeaderboardMetrics([outcome(1, false), outcome(2, false)]),
    ).toMatchObject({
      currentMatchStreak: 0,
      currentUnmatchedStreak: 2,
      matchRate: 0,
    });
  });

  it('breaks ties by cycleCreatedAt then participationUpdatedAt', () => {
    const sameDay = new Date(2026, 0, 10);
    const a: UserCycleOutcome = {
      cycleId: 'a',
      revealAt: sameDay,
      cycleCreatedAt: new Date(2026, 0, 1),
      participationUpdatedAt: sameDay,
      matched: false,
    };
    const b: UserCycleOutcome = {
      cycleId: 'b',
      revealAt: sameDay,
      cycleCreatedAt: new Date(2026, 0, 2),
      participationUpdatedAt: sameDay,
      matched: true,
    };

    const m = computeLeaderboardMetrics([a, b]);

    expect(m.currentMatchStreak).toBe(1);
    expect(m.currentUnmatchedStreak).toBe(0);
  });
});
