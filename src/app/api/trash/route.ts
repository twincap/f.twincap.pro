import { requireApiSession } from "@/server/auth";
import {
  assertSameOrigin,
  jsonNoStore,
  toErrorResponse,
} from "@/server/http";
import { getArchiveStorage } from "@/server/storage";

export async function GET(request: Request) {
  try {
    requireApiSession(request);
    return jsonNoStore(await getArchiveStorage().listTrash());
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireApiSession(request);
    assertSameOrigin(request);
    await getArchiveStorage().emptyTrash();
    return jsonNoStore({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
