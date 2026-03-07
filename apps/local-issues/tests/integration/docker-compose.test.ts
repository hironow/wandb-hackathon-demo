import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";

const COMPOSE_PATH = resolve(import.meta.dir, "../../../../docker-compose.yaml");

describe("docker-compose.yaml build cache configuration", () => {
  let content: string;

  test("docker-compose.yaml exists", async () => {
    // when
    const file = Bun.file(COMPOSE_PATH);
    const exists = await file.exists();

    // then
    expect(exists).toBe(true);
    content = await file.text();
  });

  test("build section contains cache_from configuration", async () => {
    // given
    const fileContent = await Bun.file(COMPOSE_PATH).text();

    // then
    expect(fileContent).toContain("cache_from:");
  });

  test("build section contains BUILDKIT_INLINE_CACHE build arg", async () => {
    // given
    const fileContent = await Bun.file(COMPOSE_PATH).text();

    // then
    expect(fileContent).toContain("BUILDKIT_INLINE_CACHE");
  });
});
