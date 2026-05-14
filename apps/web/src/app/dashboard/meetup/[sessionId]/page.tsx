import { redirect } from "next/navigation";
import { fetchUserApiServer } from "../../../../lib/server-api";
import type { AuthMePayload, MeetupSessionResponse } from "../../../../lib/api";
import { ensureDashboardSession, loadDashboardCore } from "../../_lib/bootstrap";
import { MeetupSessionClient } from "../_components/MeetupClient";

export default async function MeetupSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  await ensureDashboardSession();
  const { sessionId } = await params;

  if (!sessionId) {
    redirect("/dashboard/match");
  }

  let user: AuthMePayload;
  let session: MeetupSessionResponse;

  try {
    const [core, sessionResponse] = await Promise.all([
      loadDashboardCore(),
      fetchUserApiServer<MeetupSessionResponse>(
        `/me/meetup-sessions/${encodeURIComponent(sessionId)}`,
      ),
    ]);
    user = core.user;
    session = sessionResponse;
  } catch {
    redirect("/dashboard/match");
  }

  return <MeetupSessionClient initialUser={user} initialSession={session} />;
}
