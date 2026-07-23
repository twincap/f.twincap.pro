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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
