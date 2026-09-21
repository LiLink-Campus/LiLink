import { getLandingPayload } from "../lib/public-server-api";
import { getCommunityStats } from "../lib/community-stats-server";
import { HomePageView } from "./home-page-view";

export const revalidate = 60;

export default async function Home() {
  const [landing, community] = await Promise.all([
    getLandingPayload().catch(() => null),
    getCommunityStats().catch(() => null),
  ]);
  return <HomePageView landing={landing} community={community} />;
}
