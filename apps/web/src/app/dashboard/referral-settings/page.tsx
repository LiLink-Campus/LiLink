import { loadDashboardReferralSettings } from "../_lib/bootstrap";
import { ReferralSettingsClient } from "./referral-settings-client";

export default async function DashboardReferralSettingsPage() {
  const { user, contactPreferences } = await loadDashboardReferralSettings();

  return (
    <ReferralSettingsClient
      initialUser={user}
      initialContactPreferences={contactPreferences}
    />
  );
}
