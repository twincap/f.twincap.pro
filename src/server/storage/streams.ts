import { ArchiveStorageError } from "@/server/storage/types";

export function limitUploadStream(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  let receivedBytes = 0;

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        receivedBytes += chunk.byteLength;
        if (receivedBytes > maxBytes) {
          throw new ArchiveStorageError(
            413,
            "upload_too_large",
            "업로드 허용 크기를 초과했습니다.",
          );
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

export async function consumeStream(
  body: ReadableStream<Uint8Array>,
): Promise<number> {
  const reader = body.getReader();
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return receivedBytes;
      }
      receivedBytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

export function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
