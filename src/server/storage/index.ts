import { getStorageDriver } from "@/server/env";
import { MockArchiveStorage } from "@/server/storage/mock";
import type { ArchiveStorage } from "@/server/storage/types";

const mockStorage = new MockArchiveStorage();

export function getArchiveStorage(): ArchiveStorage {
  const driver = getStorageDriver();
  if (driver === "mock") {
    return mockStorage;
  }

  throw new Error(
    "The WebDAV adapter is intentionally disabled during the mock phase.",
  );
}
