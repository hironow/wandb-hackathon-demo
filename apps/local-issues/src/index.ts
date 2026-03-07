import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { sql } from "drizzle-orm";
import { createDb } from "./db/client.ts";

const VERSION = "0.1.0";
const DEFAULT_PORT = 3100;

function getPort(): number {
  const envPort = process.env.MCP_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
    console.error(`Invalid MCP_PORT value: ${envPort}, using default ${DEFAULT_PORT}`);
  }
  return DEFAULT_PORT;
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "local-issues",
    version: VERSION,
  });

  return server;
}

async function main(): Promise<void> {
  const port = getPort();
  const db = createDb();
  const mcpServer = createMcpServer();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    // Health check endpoint
    if (url.pathname === "/healthz" && req.method === "GET") {
      try {
        // Verify DB is accessible by running a simple query
        db.run(sql`SELECT 1`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", version: VERSION }));
      } catch {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "error", version: VERSION }));
      }
      return;
    }

    // MCP endpoint
    if (url.pathname === "/mcp") {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => {
        transport.close();
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    // 404 for everything else
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  httpServer.listen(port, () => {
    console.error(`local-issues MCP server listening on http://localhost:${port}`);
    console.error(`Health check: http://localhost:${port}/healthz`);
    console.error(`MCP endpoint: http://localhost:${port}/mcp`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.error("Shutting down...");
    httpServer.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
