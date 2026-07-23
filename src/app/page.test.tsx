/**
 * @vitest-environment jsdom
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ArchiveListing } from "@/lib/archive";
import Home from "./page";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    json: async () => body,
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function rectangle(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("archive upload", () => {
  it("sends the selected file as the raw upload request body", async () => {
    const rootListing: ArchiveListing = { path: "", items: [] };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);

        if (url === "/api/auth/session") {
          return jsonResponse({ user: { username: "demo" } });
        }
        if (url.startsWith("/api/files?")) {
          return jsonResponse(rootListing);
        }
        if (url === "/api/storage") {
          return jsonResponse({ driver: "webdav" });
        }
        if (
          url.includes("/api/files/upload?") &&
          init?.method === "POST"
        ) {
          return jsonResponse({ item: null });
        }

        return jsonResponse(
          {
            error: {
              code: "unexpected_request",
              message: `Unexpected request: ${url}`,
            },
          },
          500,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<Home />);

    await user.click(
      await screen.findByRole("button", { name: "업로드" }),
    );
    const dialog = await screen.findByRole("dialog");
    const file = new globalThis.File(["archive contents"], "기록.txt", {
      type: "text/plain",
    });
    const fileInput = within(dialog).getByLabelText(
      "업로드할 파일",
    ) as HTMLInputElement;
    await user.upload(fileInput, file);
    expect(fileInput.files?.item(0)).toBe(file);
    fireEvent.submit(fileInput.form!);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).includes("/api/files/upload?") &&
            init?.method === "POST",
        ),
      ).toBe(true);
    });

    const uploadCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        requestUrl(input).includes("/api/files/upload?") &&
        init?.method === "POST",
    );
    expect(uploadCall).toBeDefined();

    const [uploadInput, uploadInit] = uploadCall!;
    const uploadUrl = new URL(requestUrl(uploadInput));
    expect(uploadUrl.pathname).toBe("/api/files/upload");
    expect(uploadUrl.searchParams.get("parentPath")).toBe("");
    expect(uploadUrl.searchParams.get("name")).toBe("기록.txt");
    expect(uploadInit?.body).toBe(file);
    expect(new Headers(uploadInit?.headers).get("Content-Type")).toBe(
      "text/plain",
    );
    expect(await screen.findByText("Nextcloud WebDAV")).toBeTruthy();
  });
});

describe("archive explorer interactions", () => {
  it("uses folder URLs and browser history for navigation", async () => {
    const folder = {
      path: "프로젝트",
      name: "프로젝트",
      type: "folder" as const,
      size: null,
      modifiedAt: "2026-07-24T00:00:00.000Z",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url === "/api/auth/session") {
          return jsonResponse({ user: { username: "demo" } });
        }
        if (url === "/api/storage") {
          return jsonResponse({ driver: "webdav" });
        }
        if (url.startsWith("/api/files?")) {
          const request = new URL(url, window.location.origin);
          const requestedPath = request.searchParams.get("path") ?? "";
          return jsonResponse({
            path: requestedPath,
            items: requestedPath === "" ? [folder] : [],
          });
        }
        return jsonResponse({}, 500);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);
    const folderCheckbox = await screen.findByLabelText("프로젝트 선택");
    const folderRow = folderCheckbox.closest("article");
    expect(folderRow).toBeTruthy();
    fireEvent.doubleClick(folderRow!);

    await waitFor(() => {
      expect(window.location.pathname).toBe(
        `/browse/${encodeURIComponent("프로젝트")}`,
      );
    });

    window.history.back();
    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
  });

  it("moves every selected item when the selection is dragged onto a folder", async () => {
    const rootListing: ArchiveListing = {
      path: "",
      items: [
        {
          path: "보관",
          name: "보관",
          type: "folder",
          size: null,
          modifiedAt: "2026-07-24T00:00:00.000Z",
        },
        {
          path: "a.txt",
          name: "a.txt",
          type: "file",
          size: 1,
          modifiedAt: "2026-07-24T00:00:00.000Z",
          contentType: "text/plain",
        },
        {
          path: "b.txt",
          name: "b.txt",
          type: "file",
          size: 1,
          modifiedAt: "2026-07-24T00:00:00.000Z",
          contentType: "text/plain",
        },
      ],
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url === "/api/auth/session") {
          return jsonResponse({ user: { username: "demo" } });
        }
        if (url === "/api/storage") {
          return jsonResponse({ driver: "webdav" });
        }
        if (url.startsWith("/api/files?")) {
          return jsonResponse(rootListing);
        }
        if (url === "/api/files/move" && init?.method === "PATCH") {
          return jsonResponse({ item: null });
        }
        return jsonResponse({}, 500);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Home />);

    const firstCheckbox = await screen.findByLabelText("a.txt 선택");
    const secondCheckbox = screen.getByLabelText("b.txt 선택");
    await user.click(firstCheckbox);
    await user.click(secondCheckbox);
    await screen.findByText(/2개 선택/);

    const values = new Map<string, string>();
    const types: string[] = [];
    const dataTransfer = {
      dropEffect: "none",
      effectAllowed: "none",
      files: [] as unknown as FileList,
      getData: (type: string) => values.get(type) ?? "",
      setData: (type: string, value: string) => {
        values.set(type, value);
        if (!types.includes(type)) {
          types.push(type);
        }
      },
      types,
    };
    const firstRow = firstCheckbox.closest("article");
    const folderRow = screen
      .getByLabelText("보관 선택")
      .closest("article");
    expect(firstRow).toBeTruthy();
    expect(folderRow).toBeTruthy();

    fireEvent.dragStart(firstRow!, { dataTransfer });
    fireEvent.dragEnter(folderRow!, { dataTransfer });
    fireEvent.dragOver(folderRow!, { dataTransfer });
    fireEvent.drop(folderRow!, { dataTransfer });

    await waitFor(() => {
      const moveCalls = fetchMock.mock.calls.filter(
        ([input, init]) =>
          requestUrl(input) === "/api/files/move" &&
          init?.method === "PATCH",
      );
      expect(moveCalls).toHaveLength(2);
      expect(
        moveCalls.map(([, init]) => JSON.parse(String(init?.body))),
      ).toEqual(
        expect.arrayContaining([
          { path: "a.txt", destinationParentPath: "보관" },
          { path: "b.txt", destinationParentPath: "보관" },
        ]),
      );
    });
  });

  it("selects multiple rows with a drag-selection rectangle", async () => {
    const rootListing: ArchiveListing = {
      path: "",
      items: ["a.txt", "b.txt"].map((name) => ({
        path: name,
        name,
        type: "file" as const,
        size: 1,
        modifiedAt: "2026-07-24T00:00:00.000Z",
        contentType: "text/plain",
      })),
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url === "/api/auth/session") {
          return jsonResponse({ user: { username: "demo" } });
        }
        if (url === "/api/storage") {
          return jsonResponse({ driver: "webdav" });
        }
        if (url.startsWith("/api/files?")) {
          return jsonResponse(rootListing);
        }
        return jsonResponse({}, 500);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);

    const firstRow = (await screen.findByLabelText("a.txt 선택")).closest(
      "article",
    )!;
    const secondRow = screen
      .getByLabelText("b.txt 선택")
      .closest("article")!;
    const fileList = screen.getByTestId("file-list");
    vi.spyOn(fileList, "getBoundingClientRect").mockReturnValue(
      rectangle(0, 0, 500, 300),
    );
    vi.spyOn(firstRow, "getBoundingClientRect").mockReturnValue(
      rectangle(0, 50, 500, 50),
    );
    vi.spyOn(secondRow, "getBoundingClientRect").mockReturnValue(
      rectangle(0, 110, 500, 50),
    );
    Object.defineProperties(fileList, {
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: () => undefined },
      setPointerCapture: { value: () => undefined },
    });

    fireEvent.pointerDown(fileList, {
      button: 0,
      clientX: 480,
      clientY: 45,
      pointerId: 1,
    });
    fireEvent.pointerMove(fileList, {
      clientX: 10,
      clientY: 165,
      pointerId: 1,
    });

    expect(await screen.findByText(/2개 선택/)).toBeTruthy();
    expect(
      (screen.getByLabelText("a.txt 선택") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText("b.txt 선택") as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.pointerUp(fileList, { pointerId: 1 });
  });

  it("opens a same-origin streaming preview for supported files", async () => {
    const file = {
      path: "안내.pdf",
      name: "안내.pdf",
      type: "file" as const,
      size: 1_024,
      modifiedAt: "2026-07-24T00:00:00.000Z",
      contentType: "application/pdf",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url === "/api/auth/session") {
          return jsonResponse({ user: { username: "demo" } });
        }
        if (url === "/api/storage") {
          return jsonResponse({ driver: "webdav" });
        }
        if (url.startsWith("/api/files?")) {
          return jsonResponse({ path: "", items: [file] });
        }
        return jsonResponse({}, 500);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Home />);

    await user.click(
      await screen.findByRole("button", {
        name: "안내.pdf 미리보기",
      }),
    );
    const frame = await screen.findByTitle("안내.pdf 미리보기");
    expect(frame.getAttribute("src")).toBe(
      `/api/files/preview?path=${encodeURIComponent("안내.pdf")}`,
    );
  });

  it("shows deleted items and can submit the empty-trash action", async () => {
    const deletedItem = {
      path: "보고서.pdf.d1784764800",
      name: "보고서.pdf",
      type: "file" as const,
      size: 1_024,
      modifiedAt: "2026-07-22T00:00:00.000Z",
      contentType: "application/pdf",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url === "/api/auth/session") {
          return jsonResponse({ user: { username: "demo" } });
        }
        if (url === "/api/storage") {
          return jsonResponse({ driver: "webdav" });
        }
        if (url.startsWith("/api/files?")) {
          return jsonResponse({ path: "", items: [] });
        }
        if (url === "/api/trash" && init?.method === "DELETE") {
          return jsonResponse({ ok: true });
        }
        if (url === "/api/trash") {
          return jsonResponse({ path: "", items: [deletedItem] });
        }
        return jsonResponse({}, 500);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Home />);

    const trashButtons = await screen.findAllByRole("button", {
      name: "휴지통",
    });
    await user.click(trashButtons[0]);
    expect(await screen.findByText("보고서.pdf")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "휴지통 비우기" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.submit(within(dialog).getByText("영구 삭제").closest("form")!);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input) === "/api/trash" &&
            init?.method === "DELETE",
        ),
      ).toBe(true);
    });
  });
});
