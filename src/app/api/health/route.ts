import { jsonNoStore } from "@/server/http";

export function GET() {
  return jsonNoStore({ status: "ok" });
}
