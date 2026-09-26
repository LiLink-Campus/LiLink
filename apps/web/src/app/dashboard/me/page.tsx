import { loadDashboardCenter } from "../_lib/bootstrap";
import { CenterBootstrap } from "./center-bootstrap";

export default async function DashboardMePage() {
  const initialData = await loadDashboardCenter();
  return <CenterBootstrap key={initialData.user.id} initialData={initialData} />;
}
