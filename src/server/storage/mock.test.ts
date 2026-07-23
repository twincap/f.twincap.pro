import { beforeEach, describe, expect, it } from "vitest";

import { MockArchiveStorage } from "@/server/storage/mock";

beforeEach(() => {
  globalThis.__fArchiveMockItems = undefined;
  globalThis.__fArchiveMockTrashItems = undefined;
});

describe("mock trash", () => {
  it("moves deleted items to the trash and empties it", async () => {
    const storage = new MockArchiveStorage();

    await storage.delete("기록/아이디어.md");

    await expect(storage.list("기록")).resolves.not.toMatchObject({
      items: [expect.objectContaining({ name: "아이디어.md" })],
    });
    await expect(storage.listTrash()).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          name: "아이디어.md",
          type: "file",
        }),
      ],
    });

    await storage.emptyTrash();
    await expect(storage.listTrash()).resolves.toEqual({
      path: "",
      items: [],
    });
  });
});
