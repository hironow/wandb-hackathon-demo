import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { z } from "zod/v4";
import { createDb, type AppDatabase } from "./db/client.ts";
import { ensureTables } from "./db/migrate.ts";
import { seedAll } from "./db/seed.ts";
import {
  createDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from "./tools/documents.ts";

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
  // ── Documents ──

  server.tool(
    "list_documents",
    "List documents with optional filtering by query, project, creator, and archive status",
    {
      query: z.optional(z.string()).describe("Search query for document title"),
      projectId: z.optional(z.string()).describe("Filter by project ID"),
      initiativeId: z.optional(z.string()).describe("Filter by initiative ID"),
      creatorId: z.optional(z.string()).describe("Filter by creator user ID"),
      cursor: z.optional(z.string()).describe("Pagination cursor from previous response"),
      includeArchived: z.optional(z.boolean()).describe("Include archived documents (default false)"),
      limit: z.optional(z.number()).describe("Max results (default 50, max 100)"),
      orderBy: z.optional(z.enum(["createdAt", "updatedAt"])).describe("Sort order"),
      createdAt: z.optional(z.string()).describe("Filter by created date (ISO-8601 date or duration like -P7D)"),
      updatedAt: z.optional(z.string()).describe("Filter by updated date (ISO-8601 date or duration like -P7D)"),
    },
    async (params) => {
      try {
        const result = listDocuments(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );

  server.tool(
    "get_document",
    "Get document details by ID or slug",
    {
      id: z.string().describe("Document ID or slug"),
    },
    async (params) => {
      const result = getDocument(db, params);
      if (!result) {
        return { content: [{ type: "text" as const, text: "Document not found" }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "create_document",
    "Create a new document with title and optional content, color, icon, project, and issue association",
    {
      title: z.string().describe("Document title (required)"),
      content: z.optional(z.string()).describe("Document content (Markdown)"),
      icon: z.optional(z.string()).describe("Document icon"),
      color: z.optional(z.string()).describe("Document color"),
      project: z.optional(z.string()).describe("Associated project ID"),
      issue: z.optional(z.string()).describe("Associated issue ID"),
    },
    async (params) => {
      try {
        const result = createDocument(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );

  server.tool(
    "update_document",
    "Update an existing document by ID. Supports updating title, content, color, icon, project, issue, and archive status",
    {
      id: z.string().describe("Document ID"),
      title: z.optional(z.string()).describe("New title"),
      content: z.optional(z.string()).describe("New content (Markdown)"),
      icon: z.optional(z.string()).describe("New icon"),
      color: z.optional(z.string()).describe("New color"),
      project: z.optional(z.string()).describe("New project ID"),
      issue: z.optional(z.string()).describe("New issue ID"),
      archived: z.optional(z.boolean()).describe("Archive or unarchive the document"),
    },
    async (params) => {
      try {
        const result = updateDocument(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
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
  seedAll(db);
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
