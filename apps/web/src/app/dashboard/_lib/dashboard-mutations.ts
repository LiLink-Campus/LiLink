import type {
  DashboardHistoryItem,
  DashboardMatch,
  DashboardPayload,
} from "./types";

export function applyContactSuccessToDashboard(
  current: DashboardPayload | null,
  matchId: string,
  userId: string | null | undefined,
) {
  if (!current) {
    return current;
  }

  const timestamp = new Date().toISOString();

  const updateMatch = (match: DashboardMatch): DashboardMatch => ({
    ...match,
    introducedAt: match.introducedAt ?? timestamp,
    currentUserRequestedAt: timestamp,
    participants: match.participants.map((participant) =>
      participant.userId === userId
        ? { ...participant, contactRequestedAt: timestamp }
        : participant,
    ),
  });

  const nextRecentMatchHistory =
    current.recentMatchHistory.map<DashboardHistoryItem>((item) =>
      item.match?.id === matchId && item.result === "MATCHED"
        ? { ...item, match: updateMatch(item.match) }
        : item,
    );

  return {
    ...current,
    latestMatch:
      current.latestMatch?.id === matchId
        ? updateMatch(current.latestMatch)
        : current.latestMatch,
    recentMatchHistory: nextRecentMatchHistory,
  };
}

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
    reasons: [],
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
