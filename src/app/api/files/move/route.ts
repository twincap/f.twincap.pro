import { normalizeArchivePath } from "@/lib/paths";
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
    const destinationParentPath = normalizeArchivePath(
      body.destinationParentPath,
    );
    const item = await getArchiveStorage().move(
      path,
      destinationParentPath,
    );
    return jsonNoStore({ item });
  } catch (error) {
    return toErrorResponse(error);
  }
}
