import { normalizeArchivePath } from "@/lib/paths";
import { requireApiSession } from "@/server/auth";
import { toErrorResponse } from "@/server/http";
import { getArchiveStorage } from "@/server/storage";

export async function GET(request: Request) {
  try {
    requireApiSession(request);
    const requestUrl = new URL(request.url);
    const path = normalizeArchivePath(requestUrl.searchParams.get("path"));
    const result = await getArchiveStorage().download(path);
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.name)}`,
      "Content-Type": result.contentType,
      "X-Content-Type-Options": "nosniff",
    });
    if (result.contentLength !== undefined) {
      headers.set("Content-Length", String(result.contentLength));
    }
    return new Response(result.body, { headers });
  } catch (error) {
    return toErrorResponse(error);
  }
}
