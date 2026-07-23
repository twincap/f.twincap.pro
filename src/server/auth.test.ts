import { afterEach, describe, expect, it } from "vitest";

import {
  authenticateCredentials,
  createSessionToken,
  verifySessionToken,
} from "@/server/auth";

const originalUsername = process.env.APP_USERNAME;
const originalPassword = process.env.APP_PASSWORD;
const originalSecret = process.env.SESSION_SECRET;

afterEach(() => {
  process.env.APP_USERNAME = originalUsername;
  process.env.APP_PASSWORD = originalPassword;
  process.env.SESSION_SECRET = originalSecret;
});

describe("signed sessions", () => {
  it("authenticates configured credentials without exposing the password", () => {
    process.env.APP_USERNAME = "archive";
    process.env.APP_PASSWORD = "test-password";
    process.env.SESSION_SECRET = "test-session-secret-that-is-long-enough";

    expect(authenticateCredentials("archive", "wrong")).toBeNull();
    expect(authenticateCredentials("archive", "test-password")).toEqual({
      username: "archive",
    });
  });

  it("rejects a tampered session", () => {
    process.env.APP_USERNAME = "archive";
    process.env.APP_PASSWORD = "test-password";
    process.env.SESSION_SECRET = "test-session-secret-that-is-long-enough";

    const token = createSessionToken({ username: "archive" });
    expect(verifySessionToken(token)).toEqual({ username: "archive" });
    expect(verifySessionToken(`${token}tampered`)).toBeNull();
  });
});
