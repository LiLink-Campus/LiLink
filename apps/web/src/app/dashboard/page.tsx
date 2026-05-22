import { loadDashboardHome } from "./_lib/bootstrap";
import { computeQuestionnaireProgress } from "./_lib/progress";
import { HomeClient } from "./home-client";

export default async function DashboardHubPage() {
  const {
    user,
    dashboard,
    questionnaire,
    savedQuestionnaire,
    contactPreferences,
  } =
    await loadDashboardHome();
  const {
    percent: questionnairePercent,
    confirmedPercent: questionnaireConfirmedPercent,
    unconfirmedPercent: questionnaireUnconfirmedPercent,
    unconfirmedCount: questionnaireUnconfirmedCount,
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
      questionnaireConfirmedPercent={questionnaireConfirmedPercent}
      questionnaireUnconfirmedPercent={questionnaireUnconfirmedPercent}
      questionnaireUnconfirmedCount={questionnaireUnconfirmedCount}
      questionnaireSubmitted={questionnaireSubmitted}
      questionnaireEligibleToOptIn={questionnaireEligibleToOptIn}
      questionnaireHasIncompleteDraft={questionnaireHasIncompleteDraft}
      questionnaireAttention={savedQuestionnaire?.attention ?? null}
      contactPreferences={contactPreferences}
    />
  );
}
