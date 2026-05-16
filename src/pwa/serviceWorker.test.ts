import { describe, expect, it } from "vitest";

describe("service worker source", () => {
  it("uses versioned cache and offline shell fallback", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile("public/sw.js", "utf-8"));

    expect(source).toContain("coinly-shell-v5");
    expect(source).toContain("caches.delete");
    expect(source).toContain('caches.match("/")');
  });
});
