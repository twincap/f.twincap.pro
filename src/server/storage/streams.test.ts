import { describe, expect, it } from "vitest";

import {
  bytesToStream,
  consumeStream,
  limitUploadStream,
} from "@/server/storage/streams";

describe("upload stream size limit", () => {
  it("streams content below the configured limit", async () => {
    const bytes = new Uint8Array(8);
    await expect(
      consumeStream(limitUploadStream(bytesToStream(bytes), 8)),
    ).resolves.toBe(8);
  });

  it("stops a stream that exceeds the configured limit", async () => {
    const bytes = new Uint8Array(9);
    await expect(
      consumeStream(limitUploadStream(bytesToStream(bytes), 8)),
    ).rejects.toMatchObject({
      code: "upload_too_large",
      status: 413,
    });
  });
});
