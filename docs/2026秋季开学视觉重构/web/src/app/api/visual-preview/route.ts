import { NextRequest, NextResponse } from "next/server";
import { VISUAL_PREVIEW } from "../../../lib/visual-preview/mode";
import { previewResponse } from "../../../lib/visual-preview/data";

async function handle(request: NextRequest) {
  if (!VISUAL_PREVIEW || !["localhost", "127.0.0.1", "[::1]"].includes(request.nextUrl.hostname)) {
    return new NextResponse(null, { status: 404 });
  }
  try {
    return NextResponse.json(previewResponse(request.nextUrl.searchParams.get("path") ?? "", request.method, await request.text(), request.cookies.get("lilink_visual_state")?.value));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "预览加载失败" }, { status: 400 });
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
