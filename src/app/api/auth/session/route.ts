import { requireApiSession } from "@/server/auth";
import { jsonNoStore, toErrorResponse } from "@/server/http";

export async function GET(request: Request) {
  try {
    const user = requireApiSession(request);
    return jsonNoStore({ user });
  } catch (error) {
    return toErrorResponse(error);
  }
}
