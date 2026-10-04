import { generateDynamicSentryMetadata } from "../../lib/sentry-request-metadata";

import { loadDashboardHome } from "./_lib/bootstrap";
import { HomeBootstrap } from "./home-bootstrap";

export const generateMetadata = generateDynamicSentryMetadata;

export default async function DashboardHubPage() {
  // Share the same render-time clock between server HTML and hydration.
  const initialNowMs = Date.now();
  const initialData = await loadDashboardHome();
  return <HomeBootstrap key={initialData.user.id} initialData={initialData} initialNowMs={initialNowMs} />;
}
