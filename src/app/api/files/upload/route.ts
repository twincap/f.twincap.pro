import { normalizeArchivePath, validateArchiveName } from "@/lib/paths";
import { requireApiSession } from "@/server/auth";
import {
  ApiRequestError,
  assertSameOrigin,
  jsonNoStore,
  toErrorResponse,
} from "@/server/http";
import { getArchiveStorage } from "@/server/storage";

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
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > getMaxUploadBytes()) {
      throw new ApiRequestError(
        413,
        "upload_too_large",
        "업로드 허용 크기를 초과했습니다.",
      );
    }

    const formData = await request.formData();
    const rawPath = formData.get("parentPath");
    const file = formData.get("file");
    if (typeof rawPath !== "string" || !(file instanceof File)) {
      throw new ApiRequestError(
        400,
        "invalid_upload",
        "업로드 요청이 올바르지 않습니다.",
      );
    }
    if (file.size === 0 || file.size > getMaxUploadBytes()) {
      throw new ApiRequestError(
        413,
        "upload_too_large",
        "비어 있거나 허용 크기를 초과한 파일입니다.",
      );
    }

    const parentPath = normalizeArchivePath(rawPath);
    const name = validateArchiveName(file.name);
    const item = await getArchiveStorage().upload({
      parentPath,
      name,
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return jsonNoStore({ item }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
