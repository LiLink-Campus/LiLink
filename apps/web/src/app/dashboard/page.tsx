import { redirect } from "next/navigation";
import {
  fetchUserApiServer,
  hasUserSessionCookie,
} from "../../lib/server-api";
import type { AuthMePayload } from "../../lib/api";
import "../protected.css";
import "./dashboard.css";
import DashboardPage, {
  type DashboardPayload,
  type QuestionnairePayload,
  type SavedQuestionnairePayload,
} from "./dashboard-client";

async function getDashboardBootstrap() {
  if (!(await hasUserSessionCookie())) {
    redirect("/login");
  }

  try {
    const [user, dashboard, questionnaire, savedQuestionnaire] =
      await Promise.all([
        fetchUserApiServer<AuthMePayload>("/auth/me"),
        fetchUserApiServer<DashboardPayload>("/me/dashboard"),
        fetchUserApiServer<QuestionnairePayload>("/questionnaire/current"),
        fetchUserApiServer<SavedQuestionnairePayload>("/me/questionnaire").catch(
          () => null,
        ),
      ]);

    return {
      user,
      dashboard,
      questionnaire,
      savedQuestionnaire,
    };
  } catch {
    redirect("/login");
  }
}

export default async function DashboardServerPage() {
  const bootstrap = await getDashboardBootstrap();

  return (
    <DashboardPage
      initialUser={bootstrap.user}
      initialDashboard={bootstrap.dashboard}
      initialQuestions={bootstrap.questionnaire.questions}
      initialSchools={bootstrap.questionnaire.schools}
      initialSavedQuestionnaire={bootstrap.savedQuestionnaire}
    />
  );
}
