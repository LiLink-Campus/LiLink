import { NextResponse } from "next/server";
import { getLatestDevlogPublishedAt } from "@/lib/devlog-feed";

export const revalidate = 3600;

// Latest-date probe for the nav NEW badge. Same-origin, so the client badge
// avoids any cross-origin call to devlog. Reads the shared devlog feed, so the
// badge and the /updates mark-seen write compare the same source of truth.
export async function GET() {
  const latestPublishedAt = await getLatestDevlogPublishedAt();
  return NextResponse.json({ latestPublishedAt });
}
