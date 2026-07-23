import { normalizeArchivePath } from "@/lib/paths";
import { requireApiSession } from "@/server/auth";
import { jsonNoStore, toErrorResponse } from "@/server/http";
import { getArchiveStorage } from "@/server/storage";

export async function GET(request: Request) {
  try {
    requireApiSession(request);
    const requestUrl = new URL(request.url);
    const path = normalizeArchivePath(requestUrl.searchParams.get("path") ?? "");
    const listing = await getArchiveStorage().list(path);
    return jsonNoStore(listing);
  } catch (error) {
    return toErrorResponse(error);
  }
}
