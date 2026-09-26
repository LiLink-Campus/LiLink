import { Suspense } from "react";
import { getImageProps } from "next/image";
import { homeArtwork } from "./home-artwork";
import { HomeArtworkPreload } from "./home-artwork-preload";
import { getLandingPayload } from "../lib/public-server-api";
import { getCommunityStats } from "../lib/community-stats-server";
import { HomePageView } from "./home-page-view";
import styles from "./page.module.css";
import imageReadyStyles from "./_components/ImageReadyPage.module.css";

export const revalidate = 60;

async function HomeContent() {
  const [landing, community] = await Promise.all([
    getLandingPayload().catch(() => null),
    getCommunityStats().catch(() => null),
  ]);
  return <HomePageView landing={landing} community={community} />;
}

function PageLoading() {
  return <main className={`${styles.homePage} ${styles.homeLoading}`} aria-busy="true">
    <span className={imageReadyStyles.loading} role="status">正在加载页面…</span>
  </main>;
}

export default function Home() {
  const { props } = getImageProps(homeArtwork);
  return <>
    <HomeArtworkPreload src={props.src} srcSet={props.srcSet} sizes={props.sizes} />
    <Suspense fallback={<PageLoading />}><HomeContent /></Suspense>
  </>;
}
