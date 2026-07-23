import { normalizeArchivePath } from "@/lib/paths";
import { requireApiSession } from "@/server/auth";
import { ApiRequestError, toErrorResponse } from "@/server/http";
import { getArchiveStorage } from "@/server/storage";

const PREVIEWABLE_APPLICATION_TYPES = new Set([
  "application/json",
  "application/pdf",
  "application/xml",
]);

export function isPreviewableContentType(contentType: string): boolean {
  const mimeType = contentType.split(";", 1)[0].trim().toLowerCase();
  return (
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("image/") ||
    mimeType.startsWith("text/") ||
    mimeType.startsWith("video/") ||
    PREVIEWABLE_APPLICATION_TYPES.has(mimeType) ||
    mimeType.endsWith("+json") ||
    mimeType.endsWith("+xml")
  );
}

export async function GET(request: Request) {
  try {
    requireApiSession(request);
    const requestUrl = new URL(request.url);
    const path = normalizeArchivePath(requestUrl.searchParams.get("path"));
    const result = await getArchiveStorage().download(path);
    if (!isPreviewableContentType(result.contentType)) {
      try {
        await result.body.cancel();
      } catch {
        // The unsupported upstream body is intentionally discarded.
      }
      throw new ApiRequestError(
        415,
        "preview_not_supported",
        "이 파일 형식은 브라우저 미리보기를 지원하지 않습니다.",
      );
    }

    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(result.name)}`,
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Content-Type": result.contentType,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
    });
    if (result.contentLength !== undefined) {
      headers.set("Content-Length", String(result.contentLength));
    }
    return new Response(result.body, { headers });
  } catch (error) {
    return toErrorResponse(error);
  }
}
