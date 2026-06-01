import { NextResponse } from "next/server";
import { getLatestDevlogPublishedAt } from "@/lib/devlog-feed";

export const revalidate = 3600;

// Cheap latest-date probe for the nav NEW badge. Same-origin, so the client
// badge avoids any cross-origin call to devlog. Prefers devlog /latest.json.
export async function GET() {
  const latestPublishedAt = await getLatestDevlogPublishedAt();
  return NextResponse.json({ latestPublishedAt });
}
