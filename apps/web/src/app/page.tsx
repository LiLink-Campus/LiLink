import { Suspense } from "react";
import { createHash } from "node:crypto";
import { getStaticImageProps } from "@/components/StaticImage";
import { homeArtwork } from "./home-artwork";
import { HomeArtworkPreload } from "./home-artwork-preload";
import { getCachedPublicData } from "../lib/public-data-cache";
import type { PublicHomeData } from "../lib/public-home";
import { HomePageView } from "./home-page-view";
import styles from "./page.module.css";
import imageReadyStyles from "./_components/ImageReadyPage.module.css";

export const revalidate = 3600;

async function HomeContent() {
  const snapshot = await getCachedPublicData<PublicHomeData>("/public/home");
  const fingerprint = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  return <div style={{ display: "contents" }} data-lilink-home-fingerprint={`v1:${fingerprint}`}>
    <HomePageView landing={snapshot.landing} community={snapshot.community} />
  </div>;
}

function PageLoading() {
  return <main className={`${styles.homePage} ${styles.homeLoading}`} aria-busy="true">
    <span className={imageReadyStyles.loading} role="status">正在加载页面…</span>
  </main>;
}

export default function Home() {
  const props = getStaticImageProps(homeArtwork);
  return <>
    <HomeArtworkPreload src={props.src} srcSet={props.srcSet} sizes={props.sizes} />
    <Suspense fallback={<PageLoading />}><HomeContent /></Suspense>
  </>;
}
