import { normalizeArchivePath, validateArchiveName } from "@/lib/paths";
import { requireApiSession } from "@/server/auth";
import {
  assertSameOrigin,
  jsonNoStore,
  readJsonObject,
  toErrorResponse,
} from "@/server/http";
import { getArchiveStorage } from "@/server/storage";

export async function POST(request: Request) {
  try {
    requireApiSession(request);
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const parentPath = normalizeArchivePath(body.parentPath);
    const name = validateArchiveName(String(body.name ?? ""));
    const item = await getArchiveStorage().createFolder(parentPath, name);
    return jsonNoStore({ item }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
