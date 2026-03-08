import { describe, test, expect, mock } from "bun:test";
import { extractImages } from "./extract-images.ts";

function mockFetch(impl: (...args: unknown[]) => Promise<Response>): typeof fetch {
  const originalFetch = globalThis.fetch;
  const mocked = mock(impl) as unknown as typeof fetch;
  globalThis.fetch = mocked;
  return originalFetch;
}

describe("extractImages", () => {
  test("returns empty array for markdown with no images", async () => {
    // given
    const markdown = "# Hello\n\nThis is just text.";

    // when
    const result = await extractImages({ markdown });

    // then
    expect(result.images).toEqual([]);
    expect(result.skipped_urls).toEqual([]);
  });

  test("extracts single absolute image url and fetches as base64", async () => {
    // given
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const restore = mockFetch(async () =>
      new Response(pngBytes, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    // when
    const result = await extractImages({
      markdown: "Some text\n\n![alt text](https://example.com/image.png)\n\nMore text",
    });

    // then
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.url).toBe("https://example.com/image.png");
    expect(result.images[0]!.alt).toBe("alt text");
    expect(result.images[0]!.data).toBe(Buffer.from(pngBytes).toString("base64"));
    expect(result.images[0]!.content_type).toBe("image/png");
    expect(result.skipped_urls).toEqual([]);

    globalThis.fetch = restore;
  });

  test("extracts multiple images and fetches all", async () => {
    // given
    const restore = mockFetch(async () =>
      new Response(new Uint8Array([0xff, 0xd8]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }),
    );

    // when
    const result = await extractImages({
      markdown: "![a](https://example.com/1.png)\n\n![b](https://example.com/2.jpg)",
    });

    // then
    expect(result.images).toHaveLength(2);
    expect(result.images[0]!.url).toBe("https://example.com/1.png");
    expect(result.images[1]!.url).toBe("https://example.com/2.jpg");

    globalThis.fetch = restore;
  });

  test("handles images with empty alt text", async () => {
    // given
    const restore = mockFetch(async () =>
      new Response(new Uint8Array([0x00]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    // when
    const result = await extractImages({
      markdown: "![](https://example.com/no-alt.png)",
    });

    // then
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.alt).toBe("");

    globalThis.fetch = restore;
  });

  test("does not extract link-only markdown (no image)", async () => {
    // given
    const markdown = "[click here](https://example.com/page)";

    // when
    const result = await extractImages({ markdown });

    // then
    expect(result.images).toEqual([]);
  });

  // ── Relative URL handling ──

  test("resolves relative URL when base_url is provided", async () => {
    // given
    const restore = mockFetch(async () =>
      new Response(new Uint8Array([0x89, 0x50]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    // when
    const result = await extractImages({
      markdown: "![img](./images/photo.png)",
      base_url: "https://example.com/docs/",
    });

    // then
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.url).toBe("https://example.com/docs/images/photo.png");

    globalThis.fetch = restore;
  });

  test("returns error when relative URL found without base_url", async () => {
    // when
    const result = await extractImages({
      markdown: "![img](./relative/path.png)",
    });

    // then
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe("RELATIVE_URL_WITHOUT_BASE");
    expect(result.images).toEqual([]);
  });

  test("returns error for relative path without dot prefix and no base_url", async () => {
    // when
    const result = await extractImages({
      markdown: "![img](images/path.png)",
    });

    // then
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe("RELATIVE_URL_WITHOUT_BASE");
  });

  // ── Timeout and skipped_urls ──

  test("adds to skipped_urls when fetch times out", async () => {
    // given
    const restore = mockFetch(async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    });

    // when
    const result = await extractImages({
      markdown: "![img](https://example.com/slow.png)",
    });

    // then
    expect(result.images).toEqual([]);
    expect(result.skipped_urls).toHaveLength(1);
    expect(result.skipped_urls[0]!.url).toBe("https://example.com/slow.png");
    expect(result.skipped_urls[0]!.reason).toContain("aborted");

    globalThis.fetch = restore;
  });

  test("adds to skipped_urls when fetch returns 404", async () => {
    // given
    const restore = mockFetch(async () =>
      new Response("Not Found", { status: 404 }),
    );

    // when
    const result = await extractImages({
      markdown: "![img](https://example.com/missing.png)",
    });

    // then
    expect(result.images).toEqual([]);
    expect(result.skipped_urls).toHaveLength(1);
    expect(result.skipped_urls[0]!.url).toBe("https://example.com/missing.png");
    expect(result.skipped_urls[0]!.reason).toContain("404");

    globalThis.fetch = restore;
  });

  test("adds to skipped_urls when fetch throws network error", async () => {
    // given
    const restore = mockFetch(async () => {
      throw new Error("Network error");
    });

    // when
    const result = await extractImages({
      markdown: "![img](https://example.com/error.png)",
    });

    // then
    expect(result.images).toEqual([]);
    expect(result.skipped_urls).toHaveLength(1);
    expect(result.skipped_urls[0]!.url).toBe("https://example.com/error.png");

    globalThis.fetch = restore;
  });

  test("mixes successful and skipped images", async () => {
    // given
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(new Uint8Array([0x89]), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    // when
    const result = await extractImages({
      markdown: "![ok](https://example.com/ok.png)\n![bad](https://example.com/bad.png)",
    });

    // then
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.url).toBe("https://example.com/ok.png");
    expect(result.skipped_urls).toHaveLength(1);
    expect(result.skipped_urls[0]!.url).toBe("https://example.com/bad.png");

    globalThis.fetch = restore;
  });

  // ── Malformed markdown warning ──

  test("handles malformed markdown gracefully and logs warning", async () => {
    // given
    const restore = mockFetch(async () =>
      new Response(new Uint8Array([0x89]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    const originalConsoleError = console.error;
    const warnings: string[] = [];
    console.error = mock((...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    }) as typeof console.error;

    // when
    const result = await extractImages({
      markdown:
        "![valid](https://example.com/ok.png)\n\n![broken(no closing\n\n![also valid](https://example.com/ok2.png)",
    });

    // then
    expect(result.images).toHaveLength(2);
    expect(result.images[0]!.url).toBe("https://example.com/ok.png");
    expect(result.images[1]!.url).toBe("https://example.com/ok2.png");
    expect(warnings.some((w) => w.toLowerCase().includes("warning"))).toBe(true);

    console.error = originalConsoleError;
    globalThis.fetch = restore;
  });

  test("extracts images with special characters in url", async () => {
    // given
    const restore = mockFetch(async () =>
      new Response(new Uint8Array([0x89]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    // when
    const result = await extractImages({
      markdown: "![pic](https://example.com/path/to/image%20file.png?v=1&size=large)",
    });

    // then
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.url).toBe(
      "https://example.com/path/to/image%20file.png?v=1&size=large",
    );

    globalThis.fetch = restore;
  });

  // ── Data URL passthrough ──

  test("passes through data: URLs without fetching", async () => {
    // given
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    const markdown = `![icon](${dataUrl})`;

    // when
    const result = await extractImages({ markdown });

    // then
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.url).toBe(dataUrl);
    expect(result.images[0]!.data).toBe("iVBORw0KGgo=");
    expect(result.images[0]!.content_type).toBe("image/png");
  });
});
