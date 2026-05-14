import { loadDashboardCore } from "../../_lib/bootstrap";
import { MeetupStartClient } from "../_components/MeetupClient";

export default async function MeetupStartPage({
  searchParams,
}: {
  searchParams: Promise<{ matchId?: string | string[] }>;
}) {
  const { user, dashboard } = await loadDashboardCore();
  const params = await searchParams;
  const rawMatchId = params.matchId;
  const matchId = Array.isArray(rawMatchId) ? rawMatchId[0] : rawMatchId ?? null;
  const meetupSummary =
    matchId && dashboard.meetupSummary?.matchId === matchId
      ? dashboard.meetupSummary
      : null;

  return (
    <MeetupStartClient
      initialUser={user}
      matchId={matchId}
      meetupSummary={meetupSummary}
    />
  );
}
