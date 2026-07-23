import { describe, expect, it } from "vitest";

import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth";
import { GET } from "./route";

describe("file listing authentication", () => {
  it("does not disclose file information before authentication", async () => {
    const response = await GET(new Request("http://localhost/api/files"));
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("아카이브 안내.pdf");
  });

  it("rejects traversal after authentication", async () => {
    process.env.APP_USERNAME = "demo";
    process.env.APP_PASSWORD = "demo";
    process.env.SESSION_SECRET = "development-only-session-secret-change-me";
    const token = createSessionToken({ username: "demo" });
    const response = await GET(
      new Request("http://localhost/api/files?path=..%252fsecret", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      }),
    );
    expect(response.status).toBe(400);
  });
});
