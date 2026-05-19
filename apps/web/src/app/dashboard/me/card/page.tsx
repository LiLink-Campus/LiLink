import { loadDashboardMe } from "../../_lib/bootstrap";
import { MyCardEditorClient } from "./card-client";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStoredOneLinerIntro(
  answers: Record<string, unknown> | undefined,
) {
  const hardMatchForm = answers?.hardMatchForm;
  if (!isRecord(hardMatchForm)) {
    return "";
  }

  const oneLinerIntro = hardMatchForm.oneLinerIntro;
  return typeof oneLinerIntro === "string" ? oneLinerIntro : "";
}

export default async function DashboardMeCardPage() {
  const { user, savedQuestionnaire, contactPreferences } = await loadDashboardMe();

  return (
    <MyCardEditorClient
      initialDisplayName={savedQuestionnaire?.draft?.displayName ?? user.displayName?.trim() ?? ""}
      initialOneLinerIntro={
        savedQuestionnaire?.draft?.hardMatchForm?.oneLinerIntro ??
        readStoredOneLinerIntro(savedQuestionnaire?.answers)
      }
      initialContactPreferences={contactPreferences}
      userEmail={user.email}
      savedQuestionnaire={savedQuestionnaire}
    />
  );
}
