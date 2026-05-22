import { loadDashboardMe } from "../../_lib/bootstrap";
import { hardMatchFormFromAnswers } from "../../../../lib/hard-match";
import { MyCardEditorClient } from "./card-client";

export default async function DashboardMeCardPage() {
  const { user, savedQuestionnaire, contactPreferences, questionnaire } =
    await loadDashboardMe();
  const initialHardMatchForm =
    savedQuestionnaire?.draft?.hardMatchForm ??
    hardMatchFormFromAnswers(savedQuestionnaire?.answers, questionnaire.schools);

  return (
    <MyCardEditorClient
      initialDisplayName={savedQuestionnaire?.draft?.displayName ?? user.displayName?.trim() ?? ""}
      initialOneLinerIntro={initialHardMatchForm.oneLinerIntro}
      initialHardMatchForm={initialHardMatchForm}
      initialContactPreferences={contactPreferences}
      userEmail={user.email}
      savedQuestionnaire={savedQuestionnaire}
    />
  );
}
