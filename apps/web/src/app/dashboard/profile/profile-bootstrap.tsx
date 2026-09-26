"use client";

import type { ProfilePageData } from "../_lib/bootstrap";
import { useProfileReadBootstrap } from "../_lib/use-profile-read-bootstrap";
import { ProfileReadPending } from "../_components/ProfileReadPending";
import { ProfileWriteOwner } from "../_lib/profile-write-owner";
import { ProfileClient } from "./profile-client";

export function ProfileBootstrap({ initialData }: { initialData: ProfilePageData }) {
  const { data, error, retry, owner } = useProfileReadBootstrap("profile", initialData);
  if (!data) return <ProfileReadPending error={error} onRetry={retry} />;
  return <ProfileWriteOwner.Provider value={owner}><ProfileClient
    initialVip={data.vip}
    initialContactPreferences={data.contactPreferences}
    initialUser={data.user}
    initialDashboard={data.dashboard}
    initialQuestions={data.questionnaire.questions}
    initialQuestionnaireVersionId={data.questionnaire.id}
    initialSchools={data.questionnaire.schools}
    initialSavedQuestionnaire={data.savedQuestionnaire}
  /></ProfileWriteOwner.Provider>;
}
