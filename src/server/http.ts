import { NextResponse } from "next/server";

import { InvalidArchivePathError } from "@/lib/paths";
import { ArchiveStorageError } from "@/server/storage/types";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const requestOrigin = new URL(request.url).origin;

  if (
    (origin && origin !== requestOrigin) ||
    (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
  ) {
    throw new ApiRequestError(403, "forbidden_origin", "요청을 확인할 수 없습니다.");
  }
}

export function jsonNoStore<T>(body: T, init?: ResponseInit): NextResponse<T> {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiRequestError) {
    return jsonNoStore(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof InvalidArchivePathError) {
    return jsonNoStore(
      { error: { code: "invalid_path", message: error.message } },
      { status: 400 },
    );
  }

  if (error instanceof ArchiveStorageError) {
    return jsonNoStore(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  console.error("Unhandled API error", error);
  return jsonNoStore(
    {
      error: {
        code: "internal_error",
        message: "요청을 처리하지 못했습니다.",
      },
    },
    { status: 500 },
  );
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiRequestError(400, "invalid_json", "요청 형식이 올바르지 않습니다.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiRequestError(400, "invalid_json", "요청 형식이 올바르지 않습니다.");
  }

  return value as Record<string, unknown>;
}
