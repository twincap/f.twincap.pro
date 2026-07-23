import { describe, expect, it } from "vitest";

import type { NextcloudEnvironment } from "@/server/env";
import { InvalidArchivePathError } from "@/lib/paths";
import { bytesToStream, consumeStream } from "@/server/storage/streams";
import { ArchiveStorageError } from "@/server/storage/types";
import {
  WebDavArchiveStorage,
  type WebDavFetch,
} from "@/server/storage/webdav";

const environment: NextcloudEnvironment = {
  url: new URL("https://files.twincap.pro"),
  username: "archive-user",
  appPassword: "never-log-this-app-password",
  webdavRoot: "/remote.php/dav/files/archive-user",
};

interface CapturedRequest {
  init: (RequestInit & { duplex?: "half" }) | undefined;
  url: string;
}

function createFetchQueue(responses: Response[]) {
  const requests: CapturedRequest[] = [];
  const fetchImpl: WebDavFetch = async (input, init) => {
    requests.push({ url: String(input), init });
    const response = responses.shift();
    if (!response) {
      throw new Error("Unexpected WebDAV request in test");
    }
    return response;
  };
  return { fetchImpl, requests };
}

function multiStatus(
  entries: Array<{
    contentLength?: number;
    contentType?: string;
    folder?: boolean;
    href: string;
    modifiedAt?: string;
    trashDeletedAt?: string;
    trashName?: string;
    trashOriginalLocation?: string;
  }>,
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns">
  ${entries
    .map(
      (entry) => `<d:response>
    <d:href>${entry.href}</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype>${entry.folder ? "<d:collection />" : ""}</d:resourcetype>
        ${entry.contentLength === undefined ? "" : `<d:getcontentlength>${entry.contentLength}</d:getcontentlength>`}
        ${entry.contentType ? `<d:getcontenttype>${entry.contentType}</d:getcontenttype>` : ""}
        <d:getlastmodified>${entry.modifiedAt ?? "Wed, 23 Jul 2026 10:00:00 GMT"}</d:getlastmodified>
        ${entry.trashName ? `<nc:trashbin-filename>${entry.trashName}</nc:trashbin-filename>` : ""}
        ${entry.trashOriginalLocation ? `<nc:trashbin-original-location>${entry.trashOriginalLocation}</nc:trashbin-original-location>` : ""}
        ${entry.trashDeletedAt ? `<nc:trashbin-deletion-time>${entry.trashDeletedAt}</nc:trashbin-deletion-time>` : ""}
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>`,
    )
    .join("\n")}
</d:multistatus>`;
}

function xmlResponse(xml: string): Response {
  return new Response(xml, {
    status: 207,
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

describe("WebDAV listing and path handling", () => {
  it("uses PROPFIND and safely decodes entries below the configured root", async () => {
    const encodedFolder = encodeURIComponent("프로젝트 2026");
    const encodedFile = encodeURIComponent("계획서 #1.pdf");
    const { fetchImpl, requests } = createFetchQueue([
      xmlResponse(
        multiStatus([
          {
            href: `/remote.php/dav/files/archive-user/${encodedFolder}/`,
            folder: true,
          },
          {
            href: `/remote.php/dav/files/archive-user/${encodedFolder}/${encodedFile}`,
            contentLength: 4_096,
            contentType: "application/pdf",
          },
        ]),
      ),
    ]);
    const storage = new WebDavArchiveStorage(environment, fetchImpl);

    const listing = await storage.list("프로젝트 2026");

    expect(requests).toHaveLength(1);
    expect(requests[0].init?.method).toBe("PROPFIND");
    expect(new Headers(requests[0].init?.headers).get("Depth")).toBe("1");
    expect(requests[0].url).toBe(
      `https://files.twincap.pro/remote.php/dav/files/archive-user/${encodedFolder}/`,
    );
    expect(listing).toEqual({
      path: "프로젝트 2026",
      items: [
        {
          path: "프로젝트 2026/계획서 #1.pdf",
          name: "계획서 #1.pdf",
          type: "file",
          size: 4_096,
          modifiedAt: "2026-07-23T10:00:00.000Z",
          contentType: "application/pdf",
        },
      ],
    });
  });

  it.each([
    "../secret",
    "folder/../secret",
    String.raw`folder\secret`,
    "%252e%252e%252fsecret",
  ])("blocks unsafe archive paths before making a request: %s", async (path) => {
    const { fetchImpl, requests } = createFetchQueue([]);
    const storage = new WebDavArchiveStorage(environment, fetchImpl);

    await expect(storage.list(path)).rejects.toBeInstanceOf(
      InvalidArchivePathError,
    );
    expect(requests).toHaveLength(0);
  });

  it("blocks an unsafe rename target before making a request", async () => {
    const { fetchImpl, requests } = createFetchQueue([]);
    const storage = new WebDavArchiveStorage(environment, fetchImpl);

    await expect(storage.rename("safe.txt", "../secret.txt")).rejects.toBeInstanceOf(
      InvalidArchivePathError,
    );
    expect(requests).toHaveLength(0);
  });

  it("rejects XML declarations that can define entities", async () => {
    const { fetchImpl } = createFetchQueue([
      xmlResponse(
        `<!DOCTYPE d:multistatus [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
        <d:multistatus xmlns:d="DAV:"><d:response><d:href>&xxe;</d:href></d:response></d:multistatus>`,
      ),
    ]);
    const storage = new WebDavArchiveStorage(environment, fetchImpl);

    await expect(storage.list("")).rejects.toMatchObject({
      code: "webdav_invalid_response",
      status: 502,
    });
  });

  it("decodes predefined XML entities without enabling custom entities", async () => {
    const { fetchImpl } = createFetchQueue([
      xmlResponse(
        multiStatus([
          {
            href:
              "/remote.php/dav/files/archive-user/" +
              "notes%20&amp;%20links.txt",
            contentLength: 10,
          },
        ]),
      ),
    ]);
    const storage = new WebDavArchiveStorage(environment, fetchImpl);

    await expect(storage.list("")).resolves.toMatchObject({
      items: [{ name: "notes & links.txt" }],
    });
  });

  it("rejects repeatedly encoded traversal in a WebDAV href", async () => {
    const { fetchImpl } = createFetchQueue([
      xmlResponse(
        multiStatus([
          {
            href:
              "/remote.php/dav/files/archive-user/%252e%252e/secret.txt",
            contentLength: 10,
          },
        ]),
      ),
    ]);
    const storage = new WebDavArchiveStorage(environment, fetchImpl);

    await expect(storage.list("")).rejects.toMatchObject({
      code: "webdav_invalid_response",
      status: 502,
    });
  });
});

describe("WebDAV operations", () => {
  it("uses MKCOL, PUT, GET, and DELETE with streaming bodies", async () => {
    const downloadBytes = new TextEncoder().encode("download body");
    const { fetchImpl, requests } = createFetchQueue([
      new Response(null, { status: 201 }),
      new Response(null, { status: 201 }),
      xmlResponse(
        multiStatus([
          {
            href:
              "/remote.php/dav/files/archive-user/" +
              encodeURIComponent("새 폴더") +
              "/" +
              encodeURIComponent("메모.txt"),
            contentLength: downloadBytes.byteLength,
            contentType: "text/plain",
          },
        ]),
      ),
      new Response(bytesToStream(downloadBytes), {
        status: 200,
        headers: {
          "Content-Length": String(downloadBytes.byteLength),
          "Content-Type": "text/plain",
        },
      }),
      new Response(null, { status: 204 }),
    ]);
    const storage = new WebDavArchiveStorage(environment, fetchImpl);

    await storage.createFolder("", "새 폴더");
    const uploadBody = bytesToStream(new TextEncoder().encode("upload body"));
    await storage.upload({
      body: uploadBody,
      contentType: "text/plain",
      name: "메모.txt",
      parentPath: "새 폴더",
      size: 11,
    });
    const download = await storage.download("새 폴더/메모.txt");
    expect(await consumeStream(download.body)).toBe(downloadBytes.byteLength);
    await storage.delete("새 폴더/메모.txt");

    expect(requests.map((request) => request.init?.method)).toEqual([
      "MKCOL",
      "PUT",
      "PROPFIND",
      "GET",
      "DELETE",
    ]);
    expect(requests[1].init?.body).toBe(uploadBody);
    expect(requests[1].init?.duplex).toBe("half");
    expect(new Headers(requests[1].init?.headers).get("Content-Length")).toBe(
      "11",
    );
    expect(download).toMatchObject({
      contentLength: downloadBytes.byteLength,
      contentType: "text/plain",
      name: "메모.txt",
    });
  });

  it("uses MOVE with a full encoded Destination for rename and move", async () => {
    const sourceHref =
      "/remote.php/dav/files/archive-user/" +
      encodeURIComponent("기록") +
      "/" +
      encodeURIComponent("초안.txt");
    const sourceStat = xmlResponse(
      multiStatus([
        {
          href: sourceHref,
          contentLength: 12,
          contentType: "text/plain",
        },
      ]),
    );
    const { fetchImpl, requests } = createFetchQueue([
      sourceStat,
      new Response(null, { status: 201 }),
      xmlResponse(
        multiStatus([
          {
            href:
              "/remote.php/dav/files/archive-user/" +
              encodeURIComponent("기록") +
              "/" +
              encodeURIComponent("완성.txt"),
            contentLength: 12,
            contentType: "text/plain",
          },
        ]),
      ),
      new Response(null, { status: 201 }),
    ]);
    const storage = new WebDavArchiveStorage(environment, fetchImpl);

    await storage.rename("기록/초안.txt", "완성.txt");
    await storage.move("기록/완성.txt", "보관");

    const moveRequests = requests.filter(
      (request) => request.init?.method === "MOVE",
    );
    expect(requests[0].url.endsWith("/")).toBe(false);
    expect(moveRequests).toHaveLength(2);
    expect(
      new Headers(moveRequests[0].init?.headers).get("Destination"),
    ).toBe(
      `https://files.twincap.pro/remote.php/dav/files/archive-user/${encodeURIComponent("기록")}/${encodeURIComponent("완성.txt")}`,
    );
    expect(
      new Headers(moveRequests[1].init?.headers).get("Destination"),
    ).toBe(
      `https://files.twincap.pro/remote.php/dav/files/archive-user/${encodeURIComponent("보관")}/${encodeURIComponent("완성.txt")}`,
    );
    expect(
      new Headers(moveRequests[0].init?.headers).get("Overwrite"),
    ).toBe("F");
  });

  it("lists and empties the official Nextcloud trashbin", async () => {
    const deletedAt = 1_784_764_800;
    const trashedName = "보고서.pdf";
    const remoteName = `${trashedName}.d${deletedAt}`;
    const { fetchImpl, requests } = createFetchQueue([
      xmlResponse(
        multiStatus([
          {
            href: "/remote.php/dav/trashbin/archive-user/trash/",
            folder: true,
          },
          {
            href: `/remote.php/dav/trashbin/archive-user/trash/${encodeURIComponent(remoteName)}`,
            contentLength: 5_120,
            contentType: "application/pdf",
            trashDeletedAt: String(deletedAt),
            trashName: trashedName,
            trashOriginalLocation: `기록/${trashedName}`,
          },
        ]),
      ),
      new Response(null, { status: 204 }),
    ]);
    const storage = new WebDavArchiveStorage(environment, fetchImpl);

    const trash = await storage.listTrash();
    await storage.emptyTrash();

    expect(trash).toEqual({
      path: "",
      items: [
        {
          path: remoteName,
          name: trashedName,
          type: "file",
          size: 5_120,
          modifiedAt: new Date(deletedAt * 1000).toISOString(),
          contentType: "application/pdf",
        },
      ],
    });
    expect(requests.map((request) => request.init?.method)).toEqual([
      "PROPFIND",
      "DELETE",
    ]);
    expect(requests[0].url).toBe(
      "https://files.twincap.pro/remote.php/dav/trashbin/archive-user/trash/",
    );
    expect(requests[1].url).toBe(requests[0].url);
  });
});

describe("WebDAV authentication failures", () => {
  it("returns a sanitized error without exposing credentials", async () => {
    const { fetchImpl, requests } = createFetchQueue([
      new Response(null, { status: 401 }),
    ]);
    const storage = new WebDavArchiveStorage(environment, fetchImpl);

    let caught: unknown;
    try {
      await storage.list("");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ArchiveStorageError);
    expect(caught).toMatchObject({
      code: "webdav_auth_failed",
      status: 502,
    });
    const serialized = JSON.stringify(caught);
    expect(serialized).not.toContain(environment.appPassword);
    expect(serialized).not.toContain(environment.username);
    const authorization = new Headers(requests[0].init?.headers).get(
      "Authorization",
    );
    expect(authorization).toMatch(/^Basic /);
    expect(authorization).not.toContain(environment.appPassword);
  });
});
