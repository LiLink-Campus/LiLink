import type { DashboardPayload } from "./types";

// Old client snapshots use the same public result as a round without a pair.
export function normalizeMatchResults(dashboard: DashboardPayload): DashboardPayload {
  const latestMatch = dashboard.latestMatch?.introducedAt ? dashboard.latestMatch : null;
  return {
    ...dashboard,
    latestMatch,
    latestMatchVisibility: latestMatch ? dashboard.latestMatchVisibility : null,
    latestMatchLimitedReason: latestMatch ? dashboard.latestMatchLimitedReason : null,
    lastRevealedRound: dashboard.lastRevealedRound
      ? { ...dashboard.lastRevealedRound, matched: latestMatch !== null }
      : null,
    recentMatchHistory: dashboard.recentMatchHistory.map(item => {
      if (item.result !== "MATCHED" || item.match?.introducedAt) return item;
      return {
        ...item,
        result: item.participationStatus === "OPTED_IN" ? "UNMATCHED" : "NOT_PARTICIPATED",
        visibility: "NOT_APPLICABLE",
        limitedReason: null,
        match: null,
      };
    }),
  };
}
