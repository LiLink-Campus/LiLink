import { loadDashboardCenter } from "../_lib/bootstrap";
import { UserCenter } from "./user-center";

export default async function DashboardMePage() {
  const { user, vip } = await loadDashboardCenter();
  return <UserCenter initialUser={user} initialStatus={vip} />;
}
