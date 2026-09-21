import { fetchUserApiServer, ServerApiError } from "../../../lib/server-api";

export async function PUT(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.slice(0, -1);
  if (!["http", "https"].includes(protocol) || request.headers.get("origin") !== `${protocol}://${host}`) {
    return Response.json({ message: "Invalid request origin." }, { status: 403 });
  }
  const body = await request.text();
  if (body.length > 100_000) return new Response(null, { status: 413 });
  try {
    const result = await fetchUserApiServer("/me/questionnaire", {
      method: "PUT", body, signal: request.signal,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ServerApiError ? error.status : 503;
    return Response.json({ message: error instanceof ServerApiError ? error.message : "暂时无法保存，请稍后重试。" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
