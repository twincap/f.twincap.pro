import { requireApiSession } from "@/server/auth";
import { getStorageDriver } from "@/server/env";
import { jsonNoStore, toErrorResponse } from "@/server/http";

export function GET(request: Request) {
  try {
    requireApiSession(request);
    return jsonNoStore({ driver: getStorageDriver() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
