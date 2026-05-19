import { loadDashboardMe } from "../../_lib/bootstrap";
import type { HardMatchFormState } from "../../_lib/types";
import { MyCardEditorClient } from "./card-client";

export default async function DashboardMeCardPage() {
  const { user, savedQuestionnaire, contactPreferences } = await loadDashboardMe();
  
  return (
    <MyCardEditorClient 
      initialDisplayName={savedQuestionnaire?.draft?.displayName ?? user.displayName?.trim() ?? ""}
      initialOneLinerIntro={
        savedQuestionnaire?.draft?.hardMatchForm?.oneLinerIntro ??
        (
          savedQuestionnaire?.answers?.hardMatchForm as
            | HardMatchFormState
            | undefined
        )?.oneLinerIntro ??
        ""
      }
      initialContactPreferences={contactPreferences}
      userEmail={user.email}
      savedQuestionnaire={savedQuestionnaire}
    />
  );
}