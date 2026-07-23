import {
  getNextcloudEnvironment,
  getStorageDriver,
} from "@/server/env";
import { MockArchiveStorage } from "@/server/storage/mock";
import type { ArchiveStorage } from "@/server/storage/types";
import { WebDavArchiveStorage } from "@/server/storage/webdav";

const mockStorage = new MockArchiveStorage();

export function getArchiveStorage(): ArchiveStorage {
  const driver = getStorageDriver();
  if (driver === "mock") {
    return mockStorage;
  }
  return new WebDavArchiveStorage(getNextcloudEnvironment());
}
