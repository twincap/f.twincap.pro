import { afterEach, describe, expect, it } from "vitest";

import {
  createSessionToken,
  SESSION_COOKIE_NAME,
} from "@/server/auth";
import { GET } from "./route";

const originalStorageDriver = process.env.STORAGE_DRIVER;

afterEach(() => {
  if (originalStorageDriver === undefined) {
    delete process.env.STORAGE_DRIVER;
  } else {
    process.env.STORAGE_DRIVER = originalStorageDriver;
  }
});

describe("storage status authentication", () => {
  it("does not expose storage information before authentication", async () => {
    const response = GET(new Request("http://localhost/api/storage"));

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("NEXTCLOUD");
  });

  it("returns only the configured driver to an authenticated session", async () => {
    process.env.APP_USERNAME = "demo";
    process.env.APP_PASSWORD = "demo";
    process.env.SESSION_SECRET =
      "development-only-session-secret-change-me";
    process.env.STORAGE_DRIVER = "webdav";
    const token = createSessionToken({ username: "demo" });

    const response = GET(
      new Request("http://localhost/api/storage", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ driver: "webdav" });
  });
});
