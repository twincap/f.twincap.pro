import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("trash authentication", () => {
  it("does not expose deleted file information before authentication", async () => {
    const response = await GET(new Request("http://localhost/api/trash"));

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("아이디어.md");
  });
});
