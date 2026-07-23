import { normalizeArchivePath, validateArchiveName } from "@/lib/paths";
import { requireApiSession } from "@/server/auth";
import {
  assertSameOrigin,
  jsonNoStore,
  readJsonObject,
  toErrorResponse,
} from "@/server/http";
import { getArchiveStorage } from "@/server/storage";

export async function PATCH(request: Request) {
  try {
    requireApiSession(request);
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const path = normalizeArchivePath(body.path);
    const newName = validateArchiveName(String(body.newName ?? ""));
    const item = await getArchiveStorage().rename(path, newName);
    return jsonNoStore({ item });
  } catch (error) {
    return toErrorResponse(error);
  }
}
