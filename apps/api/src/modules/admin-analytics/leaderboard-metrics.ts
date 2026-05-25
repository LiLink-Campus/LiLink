export interface UserCycleOutcome {
  cycleId: string;
  revealAt: Date;
  cycleCreatedAt: Date;
  participationUpdatedAt: Date;
  matched: boolean;
}

export interface LeaderboardMetrics {
  optInRounds: number;
  matchedRounds: number;
  matchRate: number | null;
  currentMatchStreak: number;
  currentUnmatchedStreak: number;
}

function compareMostRecentFirst(
  a: UserCycleOutcome,
  b: UserCycleOutcome,
): number {
  const byReveal = b.revealAt.getTime() - a.revealAt.getTime();
  if (byReveal !== 0) return byReveal;
  const byCycleCreated =
    b.cycleCreatedAt.getTime() - a.cycleCreatedAt.getTime();
  if (byCycleCreated !== 0) return byCycleCreated;
  return (
    b.participationUpdatedAt.getTime() - a.participationUpdatedAt.getTime()
  );
}

export function computeLeaderboardMetrics(
  outcomes: UserCycleOutcome[],
): LeaderboardMetrics {
  const optInRounds = outcomes.length;
  if (optInRounds === 0) {
    return {
      optInRounds: 0,
      matchedRounds: 0,
      matchRate: null,
      currentMatchStreak: 0,
      currentUnmatchedStreak: 0,
    };
  }

  const ordered = [...outcomes].sort(compareMostRecentFirst);
  const matchedRounds = ordered.reduce(
    (total, outcome) => total + (outcome.matched ? 1 : 0),
    0,
  );
  const headMatched = ordered[0].matched;
  let headRun = 0;
  for (const outcome of ordered) {
    if (outcome.matched !== headMatched) break;
    headRun += 1;
  }

  return {
    optInRounds,
    matchedRounds,
    matchRate: matchedRounds / optInRounds,
    currentMatchStreak: headMatched ? headRun : 0,
    currentUnmatchedStreak: headMatched ? 0 : headRun,
  };
}
