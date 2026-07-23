import { normalizeArchivePath } from "@/lib/paths";
import { requireApiSession } from "@/server/auth";
import {
  assertSameOrigin,
  jsonNoStore,
  toErrorResponse,
} from "@/server/http";
import { getArchiveStorage } from "@/server/storage";

export async function DELETE(request: Request) {
  try {
    requireApiSession(request);
    assertSameOrigin(request);
    const requestUrl = new URL(request.url);
    const path = normalizeArchivePath(requestUrl.searchParams.get("path"));
    await getArchiveStorage().delete(path);
    return jsonNoStore({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
