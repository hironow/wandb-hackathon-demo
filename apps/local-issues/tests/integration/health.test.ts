import { describe, test, expect, afterAll } from "bun:test";
import { createServer, type Server } from "node:http";
import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";

const VERSION = "0.1.0";

function createHealthHandler(dbPath: string) {
  return (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost`);

    if (url.pathname === "/healthz" && req.method === "GET") {
      try {
        const sqlite = new Database(dbPath);
        sqlite.query("SELECT 1").get();
        sqlite.close();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", version: VERSION }));
      } catch {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "error", version: VERSION }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  };
}

const TEST_PORT = 13199;

describe("Health check endpoint (integration)", () => {
  let server: Server;
  let tempDir: string;
  let dbPath: string;

  // Set up a real SQLite DB
  tempDir = mkdtempSync(join(tmpdir(), "health-test-"));
  dbPath = join(tempDir, "test.db");
  const db = new Database(dbPath, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.close();

  server = createServer(createHealthHandler(dbPath));
  server.listen(TEST_PORT);

  afterAll(() => {
    server.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("GET /healthz returns 200 with status ok and version when DB is healthy", async () => {
    // when
    const response = await fetch(`http://localhost:${TEST_PORT}/healthz`);

    // then
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok", version: "0.1.0" });
  });

  test("GET /healthz has correct content-type", async () => {
    // when
    const response = await fetch(`http://localhost:${TEST_PORT}/healthz`);

    // then
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  test("GET /unknown returns 404", async () => {
    // when
    const response = await fetch(`http://localhost:${TEST_PORT}/unknown`);

    // then
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: "not found" });
  });
});

describe("Health check with unreachable DB", () => {
  let server: Server;
  const BAD_PORT = 13200;

  // Point to a non-existent DB path (read-only open will fail)
  server = createServer(createHealthHandler("/nonexistent/path/db.sqlite"));
  server.listen(BAD_PORT);

  afterAll(() => {
    server.close();
  });

  test("GET /healthz returns 503 when DB is unreachable", async () => {
    // when
    const response = await fetch(`http://localhost:${BAD_PORT}/healthz`);

    // then
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ status: "error", version: "0.1.0" });
  });
});
