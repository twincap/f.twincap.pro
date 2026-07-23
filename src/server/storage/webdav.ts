import { XMLParser } from "fast-xml-parser";

import type { ArchiveItem, ArchiveListing } from "@/lib/archive";
import {
  isDescendantPath,
  joinArchivePath,
  normalizeArchivePath,
  parentArchivePath,
  validateArchiveName,
} from "@/lib/paths";
import type { NextcloudEnvironment } from "@/server/env";
import {
  ArchiveStorageError,
  type ArchiveStorage,
  type DownloadResult,
  type UploadInput,
} from "@/server/storage/types";

const MAX_MULTISTATUS_BYTES = 10 * 1024 * 1024;
const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype />
    <d:getcontentlength />
    <d:getlastmodified />
    <d:getcontenttype />
  </d:prop>
</d:propfind>`;
const TRASH_PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns">
  <d:prop>
    <d:resourcetype />
    <d:getcontentlength />
    <d:getlastmodified />
    <d:getcontenttype />
    <nc:trashbin-filename />
    <nc:trashbin-original-location />
    <nc:trashbin-deletion-time />
  </d:prop>
</d:propfind>`;

type StreamingRequestInit = RequestInit & { duplex?: "half" };
export type WebDavFetch = (
  input: string | URL | Request,
  init?: StreamingRequestInit,
) => Promise<Response>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function asText(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

function isSuccessfulStatusLine(value: unknown): boolean {
  const status = asText(value);
  const match = status?.match(/\s(\d{3})(?:\s|$)/);
  return match ? Number(match[1]) >= 200 && Number(match[1]) < 300 : false;
}

function validModifiedAt(value: unknown): string {
  const rawDate = asText(value);
  if (!rawDate) {
    return new Date(0).toISOString();
  }
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString();
}

function validTrashModifiedAt(value: unknown): string {
  const rawDate = asText(value);
  if (rawDate && /^\d+$/.test(rawDate)) {
    const seconds = Number(rawDate);
    if (Number.isSafeInteger(seconds) && seconds >= 0) {
      return new Date(seconds * 1000).toISOString();
    }
  }
  return validModifiedAt(value);
}

function validSize(value: unknown): number {
  const parsed = Number(asText(value));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function findStorageError(error: unknown): ArchiveStorageError | null {
  let candidate: unknown = error;
  for (let depth = 0; depth < 5 && candidate; depth += 1) {
    if (candidate instanceof ArchiveStorageError) {
      return candidate;
    }
    candidate =
      typeof candidate === "object" && "cause" in candidate
        ? (candidate as { cause?: unknown }).cause
        : null;
  }
  return null;
}

async function readLimitedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ArchiveStorageError(
      502,
      "webdav_invalid_response",
      "Nextcloud에서 너무 큰 메타데이터 응답을 받았습니다.",
    );
  }
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new ArchiveStorageError(
          502,
          "webdav_invalid_response",
          "Nextcloud에서 너무 큰 메타데이터 응답을 받았습니다.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export class WebDavArchiveStorage implements ArchiveStorage {
  private readonly authorization: string;
  private readonly baseUrl: URL;
  private readonly fetchImpl: WebDavFetch;
  private readonly rootPathname: string;
  private readonly trashLocationPrefix: string | null;
  private readonly trashBaseUrl: URL;
  private readonly trashRootPathname: string;

  constructor(
    environment: NextcloudEnvironment,
    fetchImpl: WebDavFetch = fetch as WebDavFetch,
  ) {
    this.fetchImpl = fetchImpl;
    this.authorization = `Basic ${Buffer.from(
      `${environment.username}:${environment.appPassword}`,
      "utf8",
    ).toString("base64")}`;
    this.baseUrl = new URL(
      `${environment.webdavRoot.replace(/\/+$/, "")}/`,
      environment.url.origin,
    );
    this.rootPathname = this.baseUrl.pathname.replace(/\/+$/, "");
    const encodedUsername = encodeURIComponent(
      validateArchiveName(environment.username),
    );
    this.trashBaseUrl = new URL(
      `/remote.php/dav/trashbin/${encodedUsername}/trash/`,
      environment.url.origin,
    );
    this.trashRootPathname = this.trashBaseUrl.pathname.replace(/\/+$/, "");
    const filesRootPathname = `/remote.php/dav/files/${encodedUsername}`;
    if (this.rootPathname === filesRootPathname) {
      this.trashLocationPrefix = "";
    } else if (this.rootPathname.startsWith(`${filesRootPathname}/`)) {
      const relativeRoot = this.rootPathname.slice(
        filesRootPathname.length + 1,
      );
      try {
        this.trashLocationPrefix = normalizeArchivePath(
          relativeRoot
            .split("/")
            .map((segment) => decodeURIComponent(segment))
            .join("/"),
        );
      } catch {
        this.trashLocationPrefix = null;
      }
    } else {
      this.trashLocationPrefix = null;
    }
  }

  private buildUrl(pathInput: string, collection = false): URL {
    const path = normalizeArchivePath(pathInput);
    const encodedPath = path
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(validateArchiveName(segment)))
      .join("/");
    const suffix = encodedPath ? `${encodedPath}${collection ? "/" : ""}` : "";
    return new URL(suffix, this.baseUrl);
  }

  private archivePathFromHref(href: string): string {
    return this.pathFromHref(href, this.baseUrl, this.rootPathname);
  }

  private pathFromHref(
    href: string,
    baseUrl: URL,
    rootPathname: string,
  ): string {
    let hrefUrl: URL;
    try {
      hrefUrl = new URL(href, baseUrl);
    } catch {
      throw new ArchiveStorageError(
        502,
        "webdav_invalid_response",
        "Nextcloud에서 올바르지 않은 파일 경로를 받았습니다.",
      );
    }

    const pathname = hrefUrl.pathname.replace(/\/+$/, "");
    if (
      hrefUrl.origin !== baseUrl.origin ||
      hrefUrl.search !== "" ||
      hrefUrl.hash !== "" ||
      (pathname !== rootPathname &&
        !pathname.startsWith(`${rootPathname}/`))
    ) {
      throw new ArchiveStorageError(
        502,
        "webdav_invalid_response",
        "Nextcloud 응답이 허용된 저장소 루트를 벗어났습니다.",
      );
    }

    if (pathname === rootPathname) {
      return "";
    }

    const encodedPath = pathname.slice(rootPathname.length + 1);
    try {
      const segments = encodedPath
        .split("/")
        .map((segment) => validateArchiveName(decodeURIComponent(segment)));
      return normalizeArchivePath(segments.join("/"));
    } catch {
      throw new ArchiveStorageError(
        502,
        "webdav_invalid_response",
        "Nextcloud에서 올바르지 않은 파일 경로를 받았습니다.",
      );
    }
  }

  private parseMultiStatus(
    xml: string,
    options?: {
      baseUrl: URL;
      rootPathname: string;
      trash: boolean;
    },
  ): ArchiveItem[] {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
      throw new ArchiveStorageError(
        502,
        "webdav_invalid_response",
        "Nextcloud에서 안전하지 않은 XML 응답을 받았습니다.",
      );
    }

    let parsed: unknown;
    try {
      parsed = new XMLParser({
        ignoreAttributes: true,
        parseTagValue: false,
        processEntities: true,
        removeNSPrefix: true,
        trimValues: true,
      }).parse(xml);
    } catch {
      throw new ArchiveStorageError(
        502,
        "webdav_invalid_response",
        "Nextcloud 파일 목록 응답을 해석하지 못했습니다.",
      );
    }

    const document = asRecord(parsed);
    const multiStatus = asRecord(document?.multistatus);
    if (!multiStatus) {
      throw new ArchiveStorageError(
        502,
        "webdav_invalid_response",
        "Nextcloud 파일 목록 응답 형식이 올바르지 않습니다.",
      );
    }

    const items = new Map<string, ArchiveItem>();
    for (const rawResponse of asArray(multiStatus.response)) {
      const response = asRecord(rawResponse);
      const href = asText(response?.href);
      if (!response || !href) {
        throw new ArchiveStorageError(
          502,
          "webdav_invalid_response",
          "Nextcloud 파일 목록 응답 형식이 올바르지 않습니다.",
        );
      }

      let properties: Record<string, unknown> | null = null;
      for (const rawPropStat of asArray(response.propstat)) {
        const propStat = asRecord(rawPropStat);
        if (propStat && isSuccessfulStatusLine(propStat.status)) {
          properties = asRecord(propStat.prop);
          if (properties) {
            break;
          }
        }
      }
      if (!properties) {
        continue;
      }

      if (options?.trash) {
        const originalLocation = asText(
          properties["trashbin-original-location"],
        );
        if (!originalLocation || this.trashLocationPrefix === null) {
          continue;
        }
        let safeOriginalLocation: string;
        try {
          safeOriginalLocation = normalizeArchivePath(originalLocation);
        } catch {
          throw new ArchiveStorageError(
            502,
            "webdav_invalid_response",
            "Nextcloud에서 올바르지 않은 휴지통 원본 경로를 받았습니다.",
          );
        }
        if (
          this.trashLocationPrefix !== "" &&
          safeOriginalLocation !== this.trashLocationPrefix &&
          !isDescendantPath(
            safeOriginalLocation,
            this.trashLocationPrefix,
          )
        ) {
          continue;
        }
      }

      const path = options
        ? this.pathFromHref(href, options.baseUrl, options.rootPathname)
        : this.archivePathFromHref(href);
      const resourceType = asRecord(properties.resourcetype);
      const type =
        resourceType &&
        Object.prototype.hasOwnProperty.call(resourceType, "collection")
          ? "folder"
          : "file";
      const pathName = path ? path.slice(path.lastIndexOf("/") + 1) : "";
      const trashName = options?.trash
        ? asText(properties["trashbin-filename"])
        : null;
      let name = pathName;
      if (trashName) {
        try {
          name = validateArchiveName(trashName);
        } catch {
          throw new ArchiveStorageError(
            502,
            "webdav_invalid_response",
            "Nextcloud에서 올바르지 않은 휴지통 항목 이름을 받았습니다.",
          );
        }
      }
      items.set(path, {
        path,
        name,
        type,
        size: type === "folder" ? null : validSize(properties.getcontentlength),
        modifiedAt:
          options?.trash && properties["trashbin-deletion-time"] !== undefined
            ? validTrashModifiedAt(properties["trashbin-deletion-time"])
            : validModifiedAt(properties.getlastmodified),
        ...(asText(properties.getcontenttype)
          ? { contentType: asText(properties.getcontenttype) ?? undefined }
          : {}),
      });
    }
    return [...items.values()];
  }

  private async request(
    url: URL,
    init: StreamingRequestInit,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", this.authorization);
    headers.set("Cache-Control", "no-store");

    try {
      return await this.fetchImpl(url, {
        ...init,
        cache: "no-store",
        headers,
      });
    } catch (error) {
      const storageError = findStorageError(error);
      if (storageError) {
        throw storageError;
      }
      throw new ArchiveStorageError(
        502,
        "webdav_unavailable",
        "Nextcloud에 연결할 수 없습니다.",
      );
    }
  }

  private async expectStatus(
    response: Response,
    acceptedStatuses: readonly number[],
  ): Promise<void> {
    if (acceptedStatuses.includes(response.status)) {
      return;
    }
    try {
      await response.body?.cancel();
    } catch {
      // The remote body is intentionally discarded without logging it.
    }

    if (response.status === 401 || response.status === 403) {
      throw new ArchiveStorageError(
        502,
        "webdav_auth_failed",
        "Nextcloud 인증에 실패했습니다. 서버 설정을 확인해 주세요.",
      );
    }
    if (response.status === 404) {
      throw new ArchiveStorageError(404, "not_found", "항목을 찾을 수 없습니다.");
    }
    if (response.status === 409) {
      throw new ArchiveStorageError(
        409,
        "webdav_conflict",
        "대상 폴더가 없거나 작업이 다른 항목과 충돌했습니다.",
      );
    }
    if (response.status === 412) {
      throw new ArchiveStorageError(
        409,
        "already_exists",
        "같은 이름의 항목이 이미 있습니다.",
      );
    }
    if (response.status === 413) {
      throw new ArchiveStorageError(
        413,
        "upload_too_large",
        "업로드 허용 크기를 초과했습니다.",
      );
    }
    if (response.status === 423) {
      throw new ArchiveStorageError(
        409,
        "webdav_locked",
        "다른 작업에서 사용 중인 항목입니다.",
      );
    }
    if (response.status === 507) {
      throw new ArchiveStorageError(
        507,
        "webdav_storage_full",
        "Nextcloud 저장 공간이 부족합니다.",
      );
    }
    if (response.status === 405) {
      throw new ArchiveStorageError(
        502,
        "webdav_method_not_allowed",
        "Nextcloud에서 이 파일 작업을 허용하지 않습니다.",
      );
    }
    throw new ArchiveStorageError(
      502,
      "webdav_error",
      "Nextcloud 파일 작업을 완료하지 못했습니다.",
    );
  }

  private async propFind(
    path: string,
    depth: "0" | "1",
    collection = false,
  ): Promise<ArchiveItem[]> {
    const response = await this.request(this.buildUrl(path, collection), {
      method: "PROPFIND",
      headers: {
        Accept: "application/xml, text/xml",
        "Content-Type": "application/xml; charset=utf-8",
        Depth: depth,
      },
      body: PROPFIND_BODY,
    });
    await this.expectStatus(response, [207]);
    const xml = await readLimitedText(response, MAX_MULTISTATUS_BYTES);
    return this.parseMultiStatus(xml);
  }

  private async stat(path: string): Promise<ArchiveItem> {
    const safePath = normalizeArchivePath(path);
    const item = (await this.propFind(safePath, "0")).find(
      (candidate) => candidate.path === safePath,
    );
    if (!item) {
      throw new ArchiveStorageError(404, "not_found", "항목을 찾을 수 없습니다.");
    }
    return item;
  }

  private async moveResource(sourcePath: string, destinationPath: string) {
    const response = await this.request(this.buildUrl(sourcePath), {
      method: "MOVE",
      headers: {
        Destination: this.buildUrl(destinationPath).toString(),
        Overwrite: "F",
      },
    });
    await this.expectStatus(response, [201, 204]);
  }

  async list(pathInput: string): Promise<ArchiveListing> {
    const path = normalizeArchivePath(pathInput);
    const items = (await this.propFind(path, "1", true))
      .filter(
        (item) => item.path !== path && parentArchivePath(item.path) === path,
      )
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === "folder" ? -1 : 1;
        }
        return left.name.localeCompare(right.name, "ko");
      });
    return { path, items };
  }

  async listTrash(): Promise<ArchiveListing> {
    const response = await this.request(this.trashBaseUrl, {
      method: "PROPFIND",
      headers: {
        Accept: "application/xml, text/xml",
        "Content-Type": "application/xml; charset=utf-8",
        Depth: "1",
      },
      body: TRASH_PROPFIND_BODY,
    });
    await this.expectStatus(response, [207]);
    const xml = await readLimitedText(response, MAX_MULTISTATUS_BYTES);
    const items = this.parseMultiStatus(xml, {
      baseUrl: this.trashBaseUrl,
      rootPathname: this.trashRootPathname,
      trash: true,
    })
      .filter(
        (item) => item.path !== "" && parentArchivePath(item.path) === "",
      )
      .sort((left, right) =>
        right.modifiedAt.localeCompare(left.modifiedAt),
      );
    return { path: "", items };
  }

  async emptyTrash(): Promise<void> {
    const response = await this.request(this.trashBaseUrl, {
      method: "DELETE",
    });
    await this.expectStatus(response, [200, 204]);
  }

  async createFolder(parentInput: string, nameInput: string) {
    const parentPath = normalizeArchivePath(parentInput);
    const name = validateArchiveName(nameInput);
    const path = joinArchivePath(parentPath, name);
    const response = await this.request(this.buildUrl(path, true), {
      method: "MKCOL",
    });
    await this.expectStatus(response, [201]);
    return {
      path,
      name,
      type: "folder" as const,
      size: null,
      modifiedAt: new Date().toISOString(),
    };
  }

  async upload(input: UploadInput) {
    const parentPath = normalizeArchivePath(input.parentPath);
    const name = validateArchiveName(input.name);
    const path = joinArchivePath(parentPath, name);
    const headers = new Headers({
      "Content-Type": input.contentType || "application/octet-stream",
    });
    if (input.size !== undefined) {
      headers.set("Content-Length", String(input.size));
    }
    const response = await this.request(this.buildUrl(path), {
      method: "PUT",
      headers,
      body: input.body,
      duplex: "half",
    });
    await this.expectStatus(response, [201, 204]);
    return {
      path,
      name,
      type: "file" as const,
      size: input.size ?? 0,
      modifiedAt: new Date().toISOString(),
      contentType: input.contentType || "application/octet-stream",
    };
  }

  async download(pathInput: string): Promise<DownloadResult> {
    const path = normalizeArchivePath(pathInput);
    if (!path) {
      throw new ArchiveStorageError(400, "not_a_file", "파일이 아닙니다.");
    }
    const item = await this.stat(path);
    if (item.type !== "file") {
      throw new ArchiveStorageError(400, "not_a_file", "파일이 아닙니다.");
    }
    const response = await this.request(this.buildUrl(path), { method: "GET" });
    await this.expectStatus(response, [200]);
    if (!response.body) {
      throw new ArchiveStorageError(
        502,
        "webdav_invalid_response",
        "Nextcloud에서 파일 내용을 받지 못했습니다.",
      );
    }
    const contentLength = Number(response.headers.get("content-length"));
    return {
      body: response.body,
      ...(Number.isSafeInteger(contentLength) && contentLength >= 0
        ? { contentLength }
        : {}),
      contentType:
        response.headers.get("content-type") ?? "application/octet-stream",
      name: path.slice(path.lastIndexOf("/") + 1),
    };
  }

  async rename(pathInput: string, newNameInput: string) {
    const path = normalizeArchivePath(pathInput);
    if (!path) {
      throw new ArchiveStorageError(400, "root_protected", "루트는 변경할 수 없습니다.");
    }
    const newName = validateArchiveName(newNameInput);
    const source = await this.stat(path);
    const destinationPath = joinArchivePath(parentArchivePath(path), newName);
    if (destinationPath === path) {
      return source;
    }
    await this.moveResource(path, destinationPath);
    return {
      ...source,
      path: destinationPath,
      name: newName,
      modifiedAt: new Date().toISOString(),
    };
  }

  async move(pathInput: string, destinationParentInput: string) {
    const path = normalizeArchivePath(pathInput);
    const destinationParentPath = normalizeArchivePath(destinationParentInput);
    if (!path) {
      throw new ArchiveStorageError(400, "root_protected", "루트는 이동할 수 없습니다.");
    }
    const source = await this.stat(path);
    if (
      source.type === "folder" &&
      (destinationParentPath === path ||
        isDescendantPath(destinationParentPath, path))
    ) {
      throw new ArchiveStorageError(
        400,
        "invalid_destination",
        "폴더를 자기 자신 안으로 이동할 수 없습니다.",
      );
    }
    const destinationPath = joinArchivePath(
      destinationParentPath,
      source.name,
    );
    if (destinationPath === path) {
      return source;
    }
    await this.moveResource(path, destinationPath);
    return {
      ...source,
      path: destinationPath,
      modifiedAt: new Date().toISOString(),
    };
  }

  async delete(pathInput: string): Promise<void> {
    const path = normalizeArchivePath(pathInput);
    if (!path) {
      throw new ArchiveStorageError(400, "root_protected", "루트는 삭제할 수 없습니다.");
    }
    const response = await this.request(this.buildUrl(path), {
      method: "DELETE",
    });
    await this.expectStatus(response, [200, 204]);
  }
}
