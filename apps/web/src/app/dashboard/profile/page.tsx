import { loadDashboardProfile } from "../_lib/bootstrap";
import { ProfileBootstrap } from "./profile-bootstrap";

export default async function DashboardProfilePage() {
  const initialData = await loadDashboardProfile();
  return <ProfileBootstrap key={initialData.user.id} initialData={initialData} />;
}
