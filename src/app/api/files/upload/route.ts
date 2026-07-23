import { normalizeArchivePath, validateArchiveName } from "@/lib/paths";
import { requireApiSession } from "@/server/auth";
import {
  ApiRequestError,
  assertSameOrigin,
  jsonNoStore,
  toErrorResponse,
} from "@/server/http";
import { getArchiveStorage } from "@/server/storage";
import { limitUploadStream } from "@/server/storage/streams";

const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function getMaxUploadBytes(): number {
  const configured = Number(process.env.MAX_UPLOAD_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_UPLOAD_BYTES;
}

export async function POST(request: Request) {
  try {
    requireApiSession(request);
    assertSameOrigin(request);
    const requestUrl = new URL(request.url);
    const parentPath = normalizeArchivePath(
      requestUrl.searchParams.get("parentPath"),
    );
    const name = validateArchiveName(
      String(requestUrl.searchParams.get("name") ?? ""),
    );
    const rawContentLength = request.headers.get("content-length");
    const contentLength =
      rawContentLength === null ? undefined : Number(rawContentLength);
    if (
      contentLength !== undefined &&
      (!Number.isSafeInteger(contentLength) || contentLength < 0)
    ) {
      throw new ApiRequestError(
        400,
        "invalid_upload",
        "업로드 요청이 올바르지 않습니다.",
      );
    }
    if (
      contentLength !== undefined &&
      contentLength > getMaxUploadBytes()
    ) {
      throw new ApiRequestError(
        413,
        "upload_too_large",
        "업로드 허용 크기를 초과했습니다.",
      );
    }
    if (!request.body || contentLength === 0) {
      throw new ApiRequestError(
        400,
        "invalid_upload",
        "업로드 요청이 올바르지 않습니다.",
      );
    }

    const item = await getArchiveStorage().upload({
      parentPath,
      name,
      contentType:
        request.headers.get("content-type") ?? "application/octet-stream",
      body: limitUploadStream(request.body, getMaxUploadBytes()),
      ...(contentLength !== undefined ? { size: contentLength } : {}),
    });
    return jsonNoStore({ item }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
