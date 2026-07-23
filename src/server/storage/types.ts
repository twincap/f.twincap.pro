import type { ArchiveItem, ArchiveListing } from "@/lib/archive";

export interface UploadInput {
  bytes: Uint8Array;
  contentType: string;
  name: string;
  parentPath: string;
}

export interface DownloadResult {
  bytes: Uint8Array;
  contentType: string;
  name: string;
}

export interface ArchiveStorage {
  createFolder(parentPath: string, name: string): Promise<ArchiveItem>;
  delete(path: string): Promise<void>;
  download(path: string): Promise<DownloadResult>;
  list(path: string): Promise<ArchiveListing>;
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
