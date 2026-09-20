import { fetchUserApiServer } from "../../../lib/server-api";
import type { VipStatus } from "../vip/vip-client";
import { loadDashboardProfile } from "../_lib/bootstrap";
import { ProfileClient } from "./profile-client";

export default async function DashboardProfilePage() {
  const { user, dashboard, questionnaire, savedQuestionnaire, contactPreferences } =
    await loadDashboardProfile();
  const vip = await fetchUserApiServer<VipStatus>("/me/vip").catch(() => null);
  return (
    <ProfileClient
      initialVip={vip}
      initialContactPreferences={contactPreferences}
      initialUser={user}
      initialDashboard={dashboard}
      initialQuestions={questionnaire.questions}
      initialSchools={questionnaire.schools}
      initialSavedQuestionnaire={savedQuestionnaire}
    />
  );
}
