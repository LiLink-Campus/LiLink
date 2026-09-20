import { loadDashboardHome } from "./_lib/bootstrap";
import { computeQuestionnaireProgress } from "./_lib/progress";
import { HomeClient } from "./home-client";

export default async function DashboardHubPage() {
  // Freeze the render-time clock so the server HTML and the client hydration
  // share the same `nowMs` (see issue #75).
  const initialNowMs = Date.now();
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
    submitted: questionnaireSubmitted,
    missingOneLinerIntro: questionnaireMissingOneLinerIntro,
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
      initialNowMs={initialNowMs}
      initialUser={user}
      initialDashboard={dashboard}
      questionnairePercent={questionnairePercent}
      questionnaireSubmitted={questionnaireSubmitted}
      questionnaireMissingOneLinerIntro={questionnaireMissingOneLinerIntro}
      questionnaireEligibleToOptIn={questionnaireEligibleToOptIn}
      questionnaireHasIncompleteDraft={questionnaireHasIncompleteDraft}
      questionnaireAttention={savedQuestionnaire?.attention ?? null}
      contactPreferences={contactPreferences}
    />
  );
}
