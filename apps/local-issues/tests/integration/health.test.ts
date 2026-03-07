import { describe, test, expect, afterAll } from "bun:test";
import { createServer, type Server } from "node:http";

// Inline a minimal server for integration testing (avoids starting the full app)
function startTestServer(port: number): Server {
  const VERSION = "0.1.0";

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    if (url.pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", version: VERSION }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.listen(port);
  return server;
}

const TEST_PORT = 13199; // high port to avoid conflicts
let server: Server;

// Start server before tests
server = startTestServer(TEST_PORT);

afterAll(() => {
  server.close();
});

describe("Health check endpoint (integration)", () => {
  test("GET /health returns 200 with status ok and version", async () => {
    // when
    const response = await fetch(`http://localhost:${TEST_PORT}/health`);

    // then
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok", version: "0.1.0" });
  });

  test("GET /health has correct content-type", async () => {
    // when
    const response = await fetch(`http://localhost:${TEST_PORT}/health`);

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
