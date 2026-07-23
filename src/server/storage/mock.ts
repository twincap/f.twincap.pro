import type { ArchiveItem, ArchiveListing } from "@/lib/archive";
import {
  isDescendantPath,
  joinArchivePath,
  normalizeArchivePath,
  parentArchivePath,
  validateArchiveName,
} from "@/lib/paths";
import {
  ArchiveStorageError,
  type ArchiveStorage,
  type DownloadResult,
  type UploadInput,
} from "@/server/storage/types";
import {
  bytesToStream,
  consumeStream,
} from "@/server/storage/streams";

const INITIAL_ITEMS: ArchiveItem[] = [
  {
    path: "기록",
    name: "기록",
    type: "folder",
    size: null,
    modifiedAt: "2026-07-22T08:40:00.000Z",
  },
  {
    path: "사진",
    name: "사진",
    type: "folder",
    size: null,
    modifiedAt: "2026-07-20T02:15:00.000Z",
  },
  {
    path: "프로젝트",
    name: "프로젝트",
    type: "folder",
    size: null,
    modifiedAt: "2026-07-18T12:05:00.000Z",
  },
  {
    path: "아카이브 안내.pdf",
    name: "아카이브 안내.pdf",
    type: "file",
    size: 2_480_128,
    modifiedAt: "2026-07-23T05:28:00.000Z",
    contentType: "application/pdf",
  },
  {
    path: "기록/2026",
    name: "2026",
    type: "folder",
    size: null,
    modifiedAt: "2026-07-22T08:40:00.000Z",
  },
  {
    path: "기록/아이디어.md",
    name: "아이디어.md",
    type: "file",
    size: 18_432,
    modifiedAt: "2026-07-21T15:32:00.000Z",
    contentType: "text/markdown; charset=utf-8",
  },
  {
    path: "사진/제주",
    name: "제주",
    type: "folder",
    size: null,
    modifiedAt: "2026-07-14T09:10:00.000Z",
  },
  {
    path: "사진/여름.jpg",
    name: "여름.jpg",
    type: "file",
    size: 4_718_592,
    modifiedAt: "2026-07-20T02:15:00.000Z",
    contentType: "image/jpeg",
  },
  {
    path: "프로젝트/f.twincap.pro",
    name: "f.twincap.pro",
    type: "folder",
    size: null,
    modifiedAt: "2026-07-18T12:05:00.000Z",
  },
];

declare global {
  var __fArchiveMockItems: Map<string, ArchiveItem> | undefined;
  var __fArchiveMockTrashItems: Map<string, ArchiveItem> | undefined;
}

function getItems(): Map<string, ArchiveItem> {
  if (!globalThis.__fArchiveMockItems) {
    globalThis.__fArchiveMockItems = new Map(
      INITIAL_ITEMS.map((item) => [item.path, { ...item }]),
    );
  }
  return globalThis.__fArchiveMockItems;
}

function getTrashItems(): Map<string, ArchiveItem> {
  if (!globalThis.__fArchiveMockTrashItems) {
    globalThis.__fArchiveMockTrashItems = new Map();
  }
  return globalThis.__fArchiveMockTrashItems;
}

function cloneItem(item: ArchiveItem): ArchiveItem {
  return { ...item };
}

function requireExisting(path: string): ArchiveItem {
  const item = getItems().get(path);
  if (!item) {
    throw new ArchiveStorageError(404, "not_found", "항목을 찾을 수 없습니다.");
  }
  return item;
}

function assertParentFolder(path: string): void {
  if (path === "") {
    return;
  }
  const parent = requireExisting(path);
  if (parent.type !== "folder") {
    throw new ArchiveStorageError(400, "not_a_folder", "폴더가 아닙니다.");
  }
}

function assertAvailable(path: string): void {
  if (getItems().has(path)) {
    throw new ArchiveStorageError(
      409,
      "already_exists",
      "같은 이름의 항목이 이미 있습니다.",
    );
  }
}

function relocateItem(
  path: string,
  newPath: string,
  newName: string,
): ArchiveItem {
  const affected = [...getItems().entries()].filter(
    ([candidate]) => candidate === path || isDescendantPath(candidate, path),
  );
  for (const [oldPath] of affected) {
    getItems().delete(oldPath);
  }
  for (const [oldPath, item] of affected) {
    const suffix = oldPath.slice(path.length);
    const movedPath = `${newPath}${suffix}`;
    getItems().set(movedPath, {
      ...item,
      path: movedPath,
      name: oldPath === path ? newName : item.name,
      modifiedAt: new Date().toISOString(),
    });
  }
  return cloneItem(requireExisting(newPath));
}

export class MockArchiveStorage implements ArchiveStorage {
  async list(pathInput: string): Promise<ArchiveListing> {
    const path = normalizeArchivePath(pathInput);
    assertParentFolder(path);
    const items = [...getItems().values()]
      .filter((item) => parentArchivePath(item.path) === path)
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === "folder" ? -1 : 1;
        }
        return left.name.localeCompare(right.name, "ko");
      })
      .map(cloneItem);
    return { path, items };
  }

  async createFolder(parentInput: string, nameInput: string): Promise<ArchiveItem> {
    const parentPath = normalizeArchivePath(parentInput);
    const name = validateArchiveName(nameInput);
    assertParentFolder(parentPath);
    const path = joinArchivePath(parentPath, name);
    assertAvailable(path);
    const item: ArchiveItem = {
      path,
      name,
      type: "folder",
      size: null,
      modifiedAt: new Date().toISOString(),
    };
    getItems().set(path, item);
    return cloneItem(item);
  }

  async upload(input: UploadInput): Promise<ArchiveItem> {
    const parentPath = normalizeArchivePath(input.parentPath);
    const name = validateArchiveName(input.name);
    assertParentFolder(parentPath);
    const path = joinArchivePath(parentPath, name);
    assertAvailable(path);
    const size = await consumeStream(input.body);
    const item: ArchiveItem = {
      path,
      name,
      type: "file",
      size,
      modifiedAt: new Date().toISOString(),
      contentType: input.contentType || "application/octet-stream",
    };
    getItems().set(path, item);
    return cloneItem(item);
  }

  async rename(pathInput: string, newNameInput: string): Promise<ArchiveItem> {
    const path = normalizeArchivePath(pathInput);
    if (!path) {
      throw new ArchiveStorageError(400, "root_protected", "루트는 변경할 수 없습니다.");
    }
    const existing = requireExisting(path);
    const newName = validateArchiveName(newNameInput);
    const newPath = joinArchivePath(parentArchivePath(path), newName);
    if (newPath === path) {
      return cloneItem(existing);
    }
    assertAvailable(newPath);
    return relocateItem(path, newPath, newName);
  }

  async move(
    pathInput: string,
    destinationParentInput: string,
  ): Promise<ArchiveItem> {
    const path = normalizeArchivePath(pathInput);
    const destinationParentPath = normalizeArchivePath(destinationParentInput);
    if (!path) {
      throw new ArchiveStorageError(400, "root_protected", "루트는 이동할 수 없습니다.");
    }
    const existing = requireExisting(path);
    assertParentFolder(destinationParentPath);
    if (
      existing.type === "folder" &&
      (destinationParentPath === path ||
        isDescendantPath(destinationParentPath, path))
    ) {
      throw new ArchiveStorageError(
        400,
        "invalid_destination",
        "폴더를 자기 자신 안으로 이동할 수 없습니다.",
      );
    }
    const newPath = joinArchivePath(destinationParentPath, existing.name);
    if (newPath === path) {
      return cloneItem(existing);
    }
    assertAvailable(newPath);
    return relocateItem(path, newPath, existing.name);
  }

  async delete(pathInput: string): Promise<void> {
    const path = normalizeArchivePath(pathInput);
    if (!path) {
      throw new ArchiveStorageError(400, "root_protected", "루트는 삭제할 수 없습니다.");
    }
    const existing = requireExisting(path);
    const deletedAt = new Date().toISOString();
    const trashPath = `trash/${Date.now()}-${getTrashItems().size}`;
    getTrashItems().set(trashPath, {
      ...existing,
      path: trashPath,
      modifiedAt: deletedAt,
    });
    for (const candidate of [...getItems().keys()]) {
      if (candidate === path || isDescendantPath(candidate, path)) {
        getItems().delete(candidate);
      }
    }
  }

  async listTrash(): Promise<ArchiveListing> {
    return {
      path: "",
      items: [...getTrashItems().values()]
        .sort((left, right) =>
          right.modifiedAt.localeCompare(left.modifiedAt),
        )
        .map(cloneItem),
    };
  }

  async emptyTrash(): Promise<void> {
    getTrashItems().clear();
  }

  async download(pathInput: string): Promise<DownloadResult> {
    const path = normalizeArchivePath(pathInput);
    const item = requireExisting(path);
    if (item.type !== "file") {
      throw new ArchiveStorageError(400, "not_a_file", "파일이 아닙니다.");
    }
    const message = `Mock download for ${item.name}\n`;
    const bytes = new TextEncoder().encode(message);
    return {
      body: bytesToStream(bytes),
      contentLength: bytes.byteLength,
      contentType: item.contentType ?? "application/octet-stream",
      name: item.name,
    };
  }
}
