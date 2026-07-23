export type ArchiveItemType = "file" | "folder";

export interface ArchiveItem {
  path: string;
  name: string;
  type: ArchiveItemType;
  size: number | null;
  modifiedAt: string;
  contentType?: string;
}

export interface ArchiveListing {
  path: string;
  items: ArchiveItem[];
}

export interface SessionUser {
  username: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
