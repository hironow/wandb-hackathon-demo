import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { z } from "zod/v4";
import { createDb, type AppDatabase } from "./db/client.ts";
import { ensureTables } from "./db/migrate.ts";
import { seedAll } from "./db/seed.ts";
import { listIssueStatuses, getIssueStatus } from "./tools/issue-statuses.ts";
import { listIssueLabels, createIssueLabel } from "./tools/issue-labels.ts";

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
  server.tool(
    "list_issue_statuses",
    "List issue statuses for a team",
    { team: z.optional(z.string()).describe("Team ID to filter statuses") },
    async (params) => {
      try {
        const result = listIssueStatuses(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );

  server.tool(
    "get_issue_status",
    "Get a specific issue status by ID, name, or team",
    {
      id: z.optional(z.string()).describe("Status ID"),
      name: z.optional(z.string()).describe("Status name"),
      team: z.optional(z.string()).describe("Team ID"),
    },
    async (params) => {
      try {
        const result = getIssueStatus(db, params);
        if (!result) {
          return { content: [{ type: "text" as const, text: "Issue status not found" }], isError: true };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );

  server.tool(
    "list_issue_labels",
    "List issue labels with optional filters",
    {
      name: z.optional(z.string()).describe("Filter by label name"),
      team: z.optional(z.string()).describe("Filter by team ID"),
      limit: z.optional(z.number()).describe("Max results (default 50, max 250)"),
      orderBy: z.optional(z.enum(["createdAt", "updatedAt"])).describe("Sort order"),
    },
    async (params) => {
      const result = listIssueLabels(db, params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "create_issue_label",
    "Create a new issue label",
    {
      name: z.string().describe("Label name"),
      color: z.optional(z.string()).describe("Label color (hex)"),
      description: z.optional(z.string()).describe("Label description"),
      parentId: z.optional(z.string()).describe("Parent label ID for grouping"),
      teamId: z.optional(z.string()).describe("Team ID (null for workspace-level)"),
    },
    async (params) => {
      try {
        const result = createIssueLabel(db, params);
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
