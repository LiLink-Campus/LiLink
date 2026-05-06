import { loadDashboardHome } from "./_lib/bootstrap";
import { computeQuestionnaireProgress } from "./_lib/progress";
import { HomeClient } from "./home-client";

export default async function DashboardHubPage() {
  const { user, dashboard, questionnaire, savedQuestionnaire } =
    await loadDashboardHome();
  const {
    percent: questionnairePercent,
    submitted: questionnaireSubmitted,
    eligibleToOptIn: questionnaireEligibleToOptIn,
    hasIncompleteDraft: questionnaireHasIncompleteDraft,
  } = computeQuestionnaireProgress({
    questions: questionnaire.questions,
    schools: questionnaire.schools,
    savedQuestionnaire,
    fallbackDisplayName: user.displayName,
  });

  return (
    <HomeClient
      initialUser={user}
      initialDashboard={dashboard}
      questionnairePercent={questionnairePercent}
      questionnaireSubmitted={questionnaireSubmitted}
      questionnaireEligibleToOptIn={questionnaireEligibleToOptIn}
      questionnaireHasIncompleteDraft={questionnaireHasIncompleteDraft}
    />
  );
}
