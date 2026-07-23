import { describe, expect, it } from "vitest";

import {
  joinArchivePath,
  normalizeArchivePath,
  parentArchivePath,
  validateArchiveName,
} from "@/lib/paths";

describe("archive path safety", () => {
  it("normalizes safe relative paths", () => {
    expect(normalizeArchivePath("기록/2026")).toBe("기록/2026");
    expect(parentArchivePath("기록/2026")).toBe("기록");
    expect(joinArchivePath("기록", "새 메모.md")).toBe("기록/새 메모.md");
  });

  it.each([
    "../secret",
    "기록/../secret",
    "/etc/passwd",
    String.raw`기록\secret`,
    "%2e%2e%2fsecret",
    "%252e%252e%252fsecret",
    "기록//secret",
    "기록/%00secret",
  ])("rejects traversal input: %s", (path) => {
    expect(() => normalizeArchivePath(path)).toThrow();
  });

  it.each([".", "..", "a/b", String.raw`a\b`, "", "\u0000bad"])(
    "rejects unsafe names: %s",
    (name) => {
      expect(() => validateArchiveName(name)).toThrow();
    },
  );
});
