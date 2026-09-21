import { getCommunityStats } from "@/lib/community-stats-server";

export async function GET() {
  try {
    return Response.json(await getCommunityStats(), { headers: { "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=300" } });
  } catch {
    return Response.json({ message: "人数统计暂时不可用" }, {
      status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" },
    });
  }
}
