import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  SESSION_COOKIE_NAME,
} from "@/server/auth";
import { GET, isPreviewableContentType } from "./route";

describe("file preview", () => {
  it.each([
    "image/jpeg",
    "text/plain; charset=utf-8",
    "application/pdf",
    "application/json",
    "audio/mpeg",
    "video/mp4",
  ])("allows a safe browser preview type: %s", (contentType) => {
    expect(isPreviewableContentType(contentType)).toBe(true);
  });

  it("does not expose preview content before authentication", async () => {
    const response = await GET(
      new Request("http://localhost/api/files/preview?path=secret.txt"),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("Mock download");
  });

  it("streams supported content inline for an authenticated session", async () => {
    process.env.APP_USERNAME = "demo";
    process.env.APP_PASSWORD = "demo";
    process.env.SESSION_SECRET =
      "development-only-session-secret-change-me";
    process.env.STORAGE_DRIVER = "mock";
    globalThis.__fArchiveMockItems = undefined;
    const token = createSessionToken({ username: "demo" });
    const response = await GET(
      new Request(
        `http://localhost/api/files/preview?path=${encodeURIComponent("기록/아이디어.md")}`,
        {
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${token}`,
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("inline");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "sandbox",
    );
    expect(await response.text()).toContain("Mock download");
  });
});
