import { getServerApiBaseUrl } from "@/lib/api-base-url";

export async function GET() {
  try {
    const base = await getServerApiBaseUrl();
    const response = await fetch(`${base}/public/community`, {
      cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Community statistics unavailable");
    return Response.json(await response.json(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ message: "人数统计暂时不可用" }, { status: 503 });
  }
}
