import type {
  DashboardHistoryItem,
  DashboardMatch,
  DashboardPayload,
} from "./types";

export function applyReportSuccessToDashboard(
  current: DashboardPayload | null,
  matchId: string,
) {
  if (!current) {
    return current;
  }

  const limitMatch = (match: DashboardMatch): DashboardMatch => ({
    ...match,
    reportStatus: "OPEN",
    participants: [],
  });

  const nextRecentMatchHistory =
    current.recentMatchHistory.map<DashboardHistoryItem>((item) =>
      item.match?.id === matchId && item.result === "MATCHED"
        ? {
            ...item,
            visibility: "LIMITED",
            limitedReason: "REPORTED",
            match: limitMatch(item.match),
          }
        : item,
    );

  const isLatest = current.latestMatch?.id === matchId;

  return {
    ...current,
    latestMatch: isLatest
      ? limitMatch(current.latestMatch!)
      : current.latestMatch,
    latestMatchVisibility: isLatest
      ? ("LIMITED" as const)
      : current.latestMatchVisibility,
    latestMatchLimitedReason: isLatest
      ? ("REPORTED" as const)
      : current.latestMatchLimitedReason,
    recentMatchHistory: nextRecentMatchHistory,
  };
}
