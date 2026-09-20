import { getLandingPayload } from "../lib/public-server-api";
import { HomePageView } from "./home-page-view";

export const revalidate = 60;

export default async function Home() {
  const landing = await getLandingPayload().catch(() => null);
  return <HomePageView landing={landing} />;
}
