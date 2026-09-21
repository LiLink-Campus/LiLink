import { fetchUserApiServer } from "../../../lib/server-api";
import type { VipStatus } from "../vip/vip-client";
import { loadDashboardProfile } from "../_lib/bootstrap";
import { ProfileClient } from "./profile-client";

export default async function DashboardProfilePage() {
  const [profile, vip] = await Promise.all([
    loadDashboardProfile(),
    fetchUserApiServer<VipStatus>("/me/vip").catch(() => null),
  ]);
  const { user, dashboard, questionnaire, savedQuestionnaire, contactPreferences } = profile;
  return (
    <ProfileClient
      initialVip={vip}
      initialContactPreferences={contactPreferences}
      initialUser={user}
      initialDashboard={dashboard}
      initialQuestions={questionnaire.questions}
      initialQuestionnaireVersionId={questionnaire.id}
      initialSchools={questionnaire.schools}
      initialSavedQuestionnaire={savedQuestionnaire}
    />
  );
}
