import { Suspense } from "react";
import { createHash } from "node:crypto";
import { getCachedPublicData } from "../lib/public-data-cache";
import type { PublicHomeData } from "../lib/public-home";
import { HomePageView } from "./home-page-view";
import { HomeSnapshotSections, HomeJoinMessage } from "./home-snapshot-sections";
import styles from "./page.module.css";

export const revalidate = 3600;

async function SnapshotSections({ data }: { data: Promise<PublicHomeData> }) {
  const snapshot = await data;
  const fingerprint = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  return <div style={{ display: "contents" }} data-lilink-home-fingerprint={`v1:${fingerprint}`}>
    <HomeSnapshotSections landing={snapshot.landing} community={snapshot.community} />
  </div>;
}

async function JoinMessage({ data }: { data: Promise<PublicHomeData> }) {
  return <HomeJoinMessage landing={(await data).landing} />;
}

export default function Home() {
  // Only data-dependent slots suspend; the artwork and navigation are initial HTML.
  const data = getCachedPublicData<PublicHomeData>("/public/home");
  // Preserve the existing layout boundary so the shared main entrance animation
  // cannot delay an otherwise ready homepage.
  return <div style={{ display: "contents" }}><HomePageView
    snapshotSections={<Suspense fallback={<div className={styles.snapshotLoading} role="status">正在加载平台数据…</div>}>
      <SnapshotSections data={data} />
    </Suspense>}
    joinMessage={<Suspense fallback={<HomeJoinMessage landing={null} />}>
      <JoinMessage data={data} />
    </Suspense>}
  /></div>;
}
