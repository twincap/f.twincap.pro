import { afterEach, describe, expect, it } from "vitest";

import { getNextcloudEnvironment } from "@/server/env";
import { getArchiveStorage } from "@/server/storage";
import { MockArchiveStorage } from "@/server/storage/mock";
import { WebDavArchiveStorage } from "@/server/storage/webdav";

const environmentKeys = [
  "STORAGE_DRIVER",
  "NEXTCLOUD_URL",
  "NEXTCLOUD_USERNAME",
  "NEXTCLOUD_APP_PASSWORD",
  "NEXTCLOUD_WEBDAV_ROOT",
] as const;

const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof environmentKeys)[number], string | undefined>;

afterEach(() => {
  for (const key of environmentKeys) {
    const originalValue = originalEnvironment[key];
    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }
});

function setValidWebDavEnvironment() {
  process.env.STORAGE_DRIVER = "webdav";
  process.env.NEXTCLOUD_URL = "https://files.twincap.pro";
  process.env.NEXTCLOUD_USERNAME = "archive-user";
  process.env.NEXTCLOUD_APP_PASSWORD = "test-only-app-password";
  process.env.NEXTCLOUD_WEBDAV_ROOT =
    "/remote.php/dav/files/archive-user";
}

describe("storage driver selection", () => {
  it("keeps using the mock adapter when STORAGE_DRIVER=mock", () => {
    process.env.STORAGE_DRIVER = "mock";
    expect(getArchiveStorage()).toBeInstanceOf(MockArchiveStorage);
  });

  it("uses the WebDAV adapter when STORAGE_DRIVER=webdav", () => {
    setValidWebDavEnvironment();
    expect(getArchiveStorage()).toBeInstanceOf(WebDavArchiveStorage);
  });
});

describe("Nextcloud environment validation", () => {
  it("returns a validated server-only WebDAV configuration", () => {
    setValidWebDavEnvironment();
    expect(getNextcloudEnvironment()).toMatchObject({
      url: new URL("https://files.twincap.pro"),
      username: "archive-user",
      appPassword: "test-only-app-password",
      webdavRoot: "/remote.php/dav/files/archive-user",
    });
  });

  it.each([
    ["NEXTCLOUD_URL", "ftp://files.twincap.pro"],
    ["NEXTCLOUD_URL", "https://user:password@files.twincap.pro"],
    ["NEXTCLOUD_URL", "https://files.twincap.pro/path"],
    ["NEXTCLOUD_WEBDAV_ROOT", "../remote.php/dav/files/archive-user"],
    ["NEXTCLOUD_WEBDAV_ROOT", "/remote.php/dav/../archive-user"],
    ["NEXTCLOUD_WEBDAV_ROOT", String.raw`\remote.php\dav\files`],
  ] as const)("rejects invalid %s values", (key, value) => {
    setValidWebDavEnvironment();
    process.env[key] = value;
    expect(() => getNextcloudEnvironment()).toThrow();
  });
});
