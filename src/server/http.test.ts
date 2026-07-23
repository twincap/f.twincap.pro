import { afterEach, describe, expect, it } from "vitest";

import { getAppOrigin } from "@/server/env";
import { ApiRequestError, assertSameOrigin } from "@/server/http";

const originalAppOrigin = process.env.APP_ORIGIN;

afterEach(() => {
  if (originalAppOrigin === undefined) {
    delete process.env.APP_ORIGIN;
  } else {
    process.env.APP_ORIGIN = originalAppOrigin;
  }
});

function proxiedRequest(
  origin: string | undefined,
  fetchSite = "same-origin",
  forwardedHost?: string,
): Request {
  const headers = new Headers({ "sec-fetch-site": fetchSite });
  if (origin) {
    headers.set("origin", origin);
  }
  if (forwardedHost) {
    headers.set("x-forwarded-host", forwardedHost);
  }

  return new Request("http://localhost:3000/api/auth/login", { headers });
}

describe("APP_ORIGIN validation", () => {
  it.each([
    "ftp://f.twincap.pro",
    "f.twincap.pro",
    "https://f.twincap.pro/path",
    "https://f.twincap.pro?source=test",
    "https://f.twincap.pro#fragment",
    "https://user:password@f.twincap.pro",
  ])("rejects an invalid configured origin: %s", (origin) => {
    process.env.APP_ORIGIN = origin;
    expect(() => getAppOrigin()).toThrow(/APP_ORIGIN/);
  });

  it("accepts an absolute http or https origin", () => {
    process.env.APP_ORIGIN = "https://f.twincap.pro";
    expect(getAppOrigin()).toBe("https://f.twincap.pro");

    process.env.APP_ORIGIN = "http://localhost:3000";
    expect(getAppOrigin()).toBe("http://localhost:3000");
  });
});

describe("same-origin checks behind Cloudflare Tunnel", () => {
  it("uses APP_ORIGIN instead of the Docker-internal request origin", () => {
    process.env.APP_ORIGIN = "https://f.twincap.pro";

    expect(() =>
      assertSameOrigin(proxiedRequest("https://f.twincap.pro")),
    ).not.toThrow();
  });

  it("rejects a browser origin that differs from APP_ORIGIN", () => {
    process.env.APP_ORIGIN = "https://f.twincap.pro";

    expect(() =>
      assertSameOrigin(proxiedRequest("https://attacker.example")),
    ).toThrow(ApiRequestError);
  });

  it("does not trust x-forwarded-host to override APP_ORIGIN", () => {
    process.env.APP_ORIGIN = "https://f.twincap.pro";

    expect(() =>
      assertSameOrigin(
        proxiedRequest(
          "https://attacker.example",
          "same-origin",
          "f.twincap.pro",
        ),
      ),
    ).toThrow(ApiRequestError);
  });

  it.each(["same-site", "cross-site"])(
    "keeps rejecting sec-fetch-site=%s",
    (fetchSite) => {
      process.env.APP_ORIGIN = "https://f.twincap.pro";

      expect(() =>
        assertSameOrigin(
          proxiedRequest("https://f.twincap.pro", fetchSite),
        ),
      ).toThrow(ApiRequestError);
    },
  );

  it.each(["same-origin", "none"])(
    "continues allowing sec-fetch-site=%s",
    (fetchSite) => {
      process.env.APP_ORIGIN = "https://f.twincap.pro";

      expect(() =>
        assertSameOrigin(
          proxiedRequest("https://f.twincap.pro", fetchSite),
        ),
      ).not.toThrow();
    },
  );

  it("falls back to request.url when APP_ORIGIN is absent", () => {
    delete process.env.APP_ORIGIN;

    expect(() =>
      assertSameOrigin(proxiedRequest("http://localhost:3000")),
    ).not.toThrow();
  });
});
