import { loadDashboardProfile } from "../_lib/bootstrap";
import { ProfileClient } from "./profile-client";

export default async function DashboardProfilePage() {
  const { user, dashboard, questionnaire, savedQuestionnaire, contactPreferences, vip } = await loadDashboardProfile();
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
