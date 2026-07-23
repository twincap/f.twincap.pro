import type { ArchiveItem, ArchiveListing } from "@/lib/archive";

export interface UploadInput {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  name: string;
  parentPath: string;
  size?: number;
}

export interface DownloadResult {
  body: ReadableStream<Uint8Array>;
  contentLength?: number;
  contentType: string;
  name: string;
}

export interface ArchiveStorage {
  createFolder(parentPath: string, name: string): Promise<ArchiveItem>;
  delete(path: string): Promise<void>;
  download(path: string): Promise<DownloadResult>;
  emptyTrash(): Promise<void>;
  list(path: string): Promise<ArchiveListing>;
  listTrash(): Promise<ArchiveListing>;
  move(path: string, destinationParentPath: string): Promise<ArchiveItem>;
  rename(path: string, newName: string): Promise<ArchiveItem>;
  upload(input: UploadInput): Promise<ArchiveItem>;
}

export class ArchiveStorageError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ArchiveStorageError";
  }
}
