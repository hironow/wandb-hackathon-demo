import { describe, test, expect } from "bun:test";
import { extractImages } from "./extract-images.ts";

describe("extractImages", () => {
  test("returns empty array for markdown with no images", () => {
    // given
    const markdown = "# Hello\n\nThis is just text.";

    // when
    const result = extractImages(markdown);

    // then
    expect(result).toEqual([]);
  });

  test("extracts single image url", () => {
    // given
    const markdown = "Some text\n\n![alt text](https://example.com/image.png)\n\nMore text";

    // when
    const result = extractImages(markdown);

    // then
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ url: "https://example.com/image.png", alt: "alt text" });
  });

  test("extracts multiple images", () => {
    // given
    const markdown = "![a](https://example.com/1.png)\n\n![b](https://example.com/2.jpg)";

    // when
    const result = extractImages(markdown);

    // then
    expect(result).toHaveLength(2);
    expect(result[0]!.url).toBe("https://example.com/1.png");
    expect(result[1]!.url).toBe("https://example.com/2.jpg");
  });

  test("handles images with empty alt text", () => {
    // given
    const markdown = "![](https://example.com/no-alt.png)";

    // when
    const result = extractImages(markdown);

    // then
    expect(result).toHaveLength(1);
    expect(result[0]!.alt).toBe("");
  });

  test("handles malformed image syntax gracefully (extracts parseable parts)", () => {
    // given
    const markdown = "![valid](https://example.com/ok.png)\n\n![broken(no closing\n\n![also valid](https://example.com/ok2.png)";

    // when
    const result = extractImages(markdown);

    // then
    expect(result).toHaveLength(2);
    expect(result[0]!.url).toBe("https://example.com/ok.png");
    expect(result[1]!.url).toBe("https://example.com/ok2.png");
  });

  test("extracts images with special characters in url", () => {
    // given
    const markdown = "![pic](https://example.com/path/to/image%20file.png?v=1&size=large)";

    // when
    const result = extractImages(markdown);

    // then
    expect(result).toHaveLength(1);
    expect(result[0]!.url).toBe("https://example.com/path/to/image%20file.png?v=1&size=large");
  });

  test("does not extract link-only markdown (no image)", () => {
    // given
    const markdown = "[click here](https://example.com/page)";

    // when
    const result = extractImages(markdown);

    // then
    expect(result).toEqual([]);
  });
});
