"use client";

import type { HomePageData } from "./_lib/bootstrap";
import { useProfileReadBootstrap } from "./_lib/use-profile-read-bootstrap";
import { ProfileReadPending } from "./_components/ProfileReadPending";
import { HomeClient } from "./home-client";

export function HomeBootstrap({ initialData, initialNowMs }: { initialData: HomePageData; initialNowMs: number }) {
  const { data, error, retry } = useProfileReadBootstrap("home", initialData);
  if (!data) return <ProfileReadPending error={error} onRetry={retry} />;
  const progress = data.questionnaireProgress;
  return <HomeClient
    initialNowMs={initialNowMs}
    initialUser={data.user}
    initialDashboard={data.dashboard}
    questionnairePercent={progress.percent}
    questionnaireSubmitted={progress.submitted}
    questionnaireMissingOneLinerIntro={progress.missingOneLinerIntro}
    questionnaireEligibleToOptIn={progress.eligibleToOptIn}
    questionnaireHasIncompleteDraft={progress.hasIncompleteDraft}
    questionnaireAttention={data.questionnaireAttention}
    contactPreferences={data.contactPreferences}
  />;
}
