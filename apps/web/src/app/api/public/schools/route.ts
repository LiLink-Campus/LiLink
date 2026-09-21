import { getCachedPublicData } from "@/lib/public-data-cache";
import type { EligibleSchoolsPayload } from "@/lib/eligible-schools";

export async function GET() {
  try {
    return Response.json(await getCachedPublicData<EligibleSchoolsPayload>("/public/schools"), {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return Response.json({ message: "学校列表暂时不可用" }, {
      status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" },
    });
  }
}
