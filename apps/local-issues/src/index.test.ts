import { describe, test, expect, afterAll, beforeAll } from "bun:test";
import type { Server } from "bun";

const TEST_PORT = 3199;

let serverProcess: import("bun").Subprocess;

beforeAll(async () => {
  serverProcess = Bun.spawn(["bun", "run", "src/index.ts"], {
    cwd: import.meta.dir + "/..",
    env: { ...process.env, MCP_PORT: String(TEST_PORT) },
    stdout: "ignore",
    stderr: "ignore",
  });

  // Wait for server to be ready
  const maxRetries = 20;
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fetch(`http://localhost:${TEST_PORT}/healthz`);
      return;
    } catch {
      await Bun.sleep(250);
    }
  }
  throw new Error("Server did not start in time");
});

afterAll(() => {
  serverProcess.kill();
});

describe("health check endpoint", () => {
  test("GET /healthz returns 200 with status ok and version", async () => {
    // when
    const res = await fetch(`http://localhost:${TEST_PORT}/healthz`);
    const body = (await res.json()) as { status: string; version: string };

    // then
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("GET /health returns 404 (old endpoint removed)", async () => {
    // when
    const res = await fetch(`http://localhost:${TEST_PORT}/health`);

    // then
    expect(res.status).toBe(404);
  });
});
