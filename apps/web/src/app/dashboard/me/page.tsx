import { loadDashboardMe } from "../_lib/bootstrap";
import { MeClient } from "./me-client";

export default async function DashboardMePage() {
  const { user, savedQuestionnaire, contactPreferences } = await loadDashboardMe();

  return (
    <MeClient
      initialUser={user}
      initialSavedQuestionnaire={savedQuestionnaire}
      initialContactPreferences={contactPreferences}
    />
  );
}
