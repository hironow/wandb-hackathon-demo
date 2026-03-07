import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { z } from "zod/v4";
import { createDb, type AppDatabase } from "./db/client.ts";
import { ensureTables, ensureFtsTables } from "./db/migrate.ts";
import { seedAll } from "./db/seed.ts";
import { listCycles } from "./tools/cycles.ts";
import { extractImages } from "./tools/extract-images.ts";
import { searchDocumentation, rebuildSearchIndex } from "./tools/search-documentation.ts";

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

function registerTools(server: McpServer, db: AppDatabase): void {
  // ── Cycles ──

  server.tool(
    "list_cycles",
    "List cycles for a team with optional type filter (current, previous, next)",
    {
      teamId: z.string().describe("Team ID to filter cycles"),
      type: z.optional(z.enum(["current", "previous", "next"])).describe("Filter by cycle type"),
    },
    async (params) => {
      try {
        const result = listCycles(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }) }], isError: true };
      }
    },
  );

  // ── Extract Images ──

  server.tool(
    "extract_images",
    "Extract image URLs and alt text from Markdown content",
    {
      markdown: z.string().describe("Markdown content to extract images from"),
    },
    async (params) => {
      const result = extractImages(params.markdown);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── Search Documentation ──

  server.tool(
    "search_documentation",
    "Full-text search across issues and documents using FTS5",
    {
      query: z.string().describe("Search query"),
      page: z.optional(z.number()).describe("Page number (default 1)"),
      page_size: z.optional(z.number()).describe("Results per page (default 20, max 100)"),
    },
    async (params) => {
      try {
        const result = searchDocumentation(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: { code: "SEARCH_ERROR", message } }) }], isError: true };
      }
    },
  );
}

function createMcpServer(db: AppDatabase): McpServer {
  const server = new McpServer({
    name: "local-issues",
    version: VERSION,
  });

  registerTools(server, db);

  return server;
}

async function main(): Promise<void> {
  const port = getPort();
  const db = createDb();
  ensureTables(db);
  ensureFtsTables(db);
  seedAll(db);
  rebuildSearchIndex(db);
  const mcpServer = createMcpServer(db);

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    // Health check endpoint
    if (url.pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", version: VERSION }));
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
    console.error(`Health check: http://localhost:${port}/health`);
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
