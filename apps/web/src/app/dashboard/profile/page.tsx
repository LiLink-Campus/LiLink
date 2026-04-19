import { loadDashboardProfile } from "../_lib/bootstrap";
import "../../protected.css";
import "../dashboard.css";
import { ProfileClient } from "./profile-client";

export default async function DashboardProfilePage() {
  const { user, dashboard, questionnaire, savedQuestionnaire } =
    await loadDashboardProfile();
  return (
    <ProfileClient
      initialUser={user}
      initialDashboard={dashboard}
      initialQuestions={questionnaire.questions}
      initialSchools={questionnaire.schools}
      initialSavedQuestionnaire={savedQuestionnaire}
    />
  );
}
