import {
  clearSessionCookie,
  requireApiSession,
} from "@/server/auth";
import {
  assertSameOrigin,
  jsonNoStore,
  toErrorResponse,
} from "@/server/http";

export async function POST(request: Request) {
  try {
    requireApiSession(request);
    assertSameOrigin(request);
    const response = jsonNoStore({ ok: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
