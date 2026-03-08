import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { createDb, type AppDatabase } from "./db/client.ts";
import { ensureTables } from "./db/migrate.ts";
import { seedAll } from "./db/seed.ts";
import { listIssueStatuses, getIssueStatus } from "./tools/issue-statuses.ts";
import { listIssueLabels, createIssueLabel } from "./tools/issue-labels.ts";
import { saveIssue, getIssue, listIssues } from "./tools/issues.ts";
import { saveProject, getProject, listProjects, listProjectLabels, createProjectLabel, deleteProjectLabel } from "./tools/projects.ts";
import { saveMilestone, getMilestone, listMilestones } from "./tools/milestones.ts";
import { saveComment, listComments, deleteComment } from "./tools/comments.ts";
import { createAttachment, getAttachment, deleteAttachment } from "./tools/attachments.ts";
import { registerTeamsTools, registerUsersTools } from "./tools/register.ts";

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
      cursor: z.optional(z.string()).describe("Next page cursor"),
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

  // ── Issues ──

  server.tool(
    "get_issue",
    "Retrieve detailed information about an issue by ID or identifier",
    {
      id: z.string().describe("Issue ID or identifier (e.g., DEF-123)"),
      includeRelations: z.optional(z.boolean()).describe("Include blocking/related/duplicate relations"),
    },
    async (params) => {
      const result = getIssue(db, params);
      if (!result) {
        return { content: [{ type: "text" as const, text: "Issue not found" }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "list_issues",
    "List issues with optional filters",
    {
      assignee: z.optional(z.nullable(z.string())).describe("User ID, name, email, or 'me'. Null for unassigned"),
      state: z.optional(z.string()).describe("State type, name, or ID"),
      team: z.optional(z.string()).describe("Team name or ID"),
      project: z.optional(z.string()).describe("Project name, ID, or slug"),
      label: z.optional(z.string()).describe("Label name or ID"),
      priority: z.optional(z.number()).describe("0=None, 1=Urgent, 2=High, 3=Normal, 4=Low"),
      cycle: z.optional(z.string()).describe("Cycle name, number, or ID"),
      query: z.optional(z.string()).describe("Search issue title or description"),
      parentId: z.optional(z.string()).describe("Parent issue ID"),
      delegate: z.optional(z.string()).describe("Agent name or ID"),
      limit: z.optional(z.number()).describe("Max results (default 50, max 250)"),
      orderBy: z.optional(z.enum(["createdAt", "updatedAt"])).describe("Sort: createdAt | updatedAt"),
      includeArchived: z.optional(z.boolean()).describe("Include archived items"),
      createdAt: z.optional(z.string()).describe("Created after: ISO-8601 date/duration"),
      updatedAt: z.optional(z.string()).describe("Updated after: ISO-8601 date/duration"),
    },
    async (params) => {
      const result = listIssues(db, params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "save_issue",
    "Create or update a Linear issue. If id is provided, updates the existing issue; otherwise creates a new one. When creating, title and team are required.",
    {
      id: z.optional(z.string()).describe("Issue ID. If provided, updates the existing issue"),
      title: z.optional(z.string()).describe("Issue title (required when creating)"),
      team: z.optional(z.string()).describe("Team name or ID (required when creating)"),
      description: z.optional(z.string()).describe("Content as Markdown"),
      assignee: z.optional(z.string()).describe("User ID, name, email, or 'me'"),
      state: z.optional(z.string()).describe("State type, name, or ID"),
      priority: z.optional(z.number()).describe("0=None, 1=Urgent, 2=High, 3=Normal, 4=Low"),
      estimate: z.optional(z.number()).describe("Issue estimate value"),
      labels: z.optional(z.array(z.string())).describe("Label names or IDs"),
      project: z.optional(z.string()).describe("Project name, ID, or slug"),
      parentId: z.optional(z.string()).describe("Parent issue ID"),
      dueDate: z.optional(z.string()).describe("Due date (ISO format)"),
      cycle: z.optional(z.string()).describe("Cycle name, number, or ID"),
      blocks: z.optional(z.array(z.string())).describe("Issue IDs/identifiers this blocks"),
      blockedBy: z.optional(z.array(z.string())).describe("Issue IDs/identifiers blocking this"),
    },
    async (params) => {
      try {
        const result = saveIssue(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );

  // ── Projects ──

  server.tool(
    "list_projects",
    "List projects with optional filters",
    {
      query: z.optional(z.string()).describe("Search project name"),
      team: z.optional(z.string()).describe("Team name or ID"),
      state: z.optional(z.string()).describe("Project state (planned/started/paused/completed/canceled)"),
      member: z.optional(z.string()).describe("Member user ID"),
      initiative: z.optional(z.string()).describe("Initiative ID"),
      includeMembers: z.optional(z.boolean()).describe("Include project members"),
      includeMilestones: z.optional(z.boolean()).describe("Include project milestones"),
      limit: z.optional(z.number()).describe("Max results (default 50, max 250)"),
      orderBy: z.optional(z.enum(["createdAt", "updatedAt"])).describe("Sort order"),
      includeArchived: z.optional(z.boolean()).describe("Include archived items"),
      createdAt: z.optional(z.string()).describe("Created after: ISO-8601 date/duration"),
      updatedAt: z.optional(z.string()).describe("Updated after: ISO-8601 date/duration"),
    },
    async (params) => {
      const result = listProjects(db, params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "get_project",
    "Get project details by ID or name",
    {
      query: z.string().describe("Project ID, name, or slug"),
      includeMembers: z.optional(z.boolean()).describe("Include project members"),
      includeMilestones: z.optional(z.boolean()).describe("Include project milestones"),
      includeResources: z.optional(z.boolean()).describe("Include project resources"),
    },
    async (params) => {
      const result = getProject(db, params);
      if (!result) {
        return { content: [{ type: "text" as const, text: "Project not found" }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "save_project",
    "Create or update a project. If id is provided, updates the existing project; otherwise creates a new one. When creating, name and team are required.",
    {
      id: z.optional(z.string()).describe("Project ID. If provided, updates the existing project"),
      name: z.optional(z.string()).describe("Project name (required when creating)"),
      team: z.optional(z.string()).describe("Team ID (required when creating)"),
      description: z.optional(z.string()).describe("Project description"),
      state: z.optional(z.string()).describe("Project state (planned/started/paused/completed/canceled)"),
      icon: z.optional(z.string()).describe("Project icon"),
      color: z.optional(z.string()).describe("Project color (hex)"),
      lead: z.optional(z.string()).describe("Lead user ID"),
      startDate: z.optional(z.string()).describe("Start date (YYYY-MM-DD)"),
      targetDate: z.optional(z.string()).describe("Target date (YYYY-MM-DD)"),
      archived: z.optional(z.boolean()).describe("Set true to archive, false to unarchive"),
    },
    async (params) => {
      try {
        const result = saveProject(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );

  server.tool(
    "list_project_labels",
    "List project labels",
    {
      limit: z.optional(z.number()).describe("Max results (default 50, max 250)"),
      orderBy: z.optional(z.enum(["createdAt", "updatedAt"])).describe("Sort order"),
      name: z.optional(z.string()).describe("Filter by label name"),
    },
    async (params) => {
      const result = listProjectLabels(db, params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "create_project_label",
    "Create a new project label",
    {
      name: z.string().describe("Label name"),
      color: z.optional(z.string()).describe("Label color (hex)"),
      description: z.optional(z.string()).describe("Label description"),
    },
    async (params) => {
      try {
        const result = createProjectLabel(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );

  server.tool(
    "delete_project_label",
    "Delete a project label by ID",
    {
      id: z.string().describe("Label ID to delete"),
    },
    async (params) => {
      try {
        const result = deleteProjectLabel(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );

  // ── Milestones ──

  server.tool(
    "list_milestones",
    "List milestones for a project",
    {
      project: z.string().describe("Project ID"),
    },
    async (params) => {
      const result = listMilestones(db, { projectId: params.project });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "get_milestone",
    "Get milestone details by ID",
    {
      id: z.string().describe("Milestone ID"),
    },
    async (params) => {
      const result = getMilestone(db, params);
      if (!result) {
        return { content: [{ type: "text" as const, text: "Milestone not found" }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "save_milestone",
    "Create or update a milestone. If id is provided, updates the existing milestone; otherwise creates a new one. When creating, name and projectId are required.",
    {
      id: z.optional(z.string()).describe("Milestone ID. If provided, updates the existing milestone"),
      name: z.optional(z.string()).describe("Milestone name (required when creating)"),
      projectId: z.optional(z.string()).describe("Project ID (required when creating)"),
      description: z.optional(z.string()).describe("Milestone description"),
      targetDate: z.optional(z.string()).describe("Target date (YYYY-MM-DD)"),
      sortOrder: z.optional(z.number()).describe("Sort order for display"),
    },
    async (params) => {
      try {
        const result = saveMilestone(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );

  // ── Comments ──

  server.tool(
    "list_comments",
    "List comments for a specific Linear issue",
    {
      issueId: z.string().describe("Issue ID"),
      limit: z.optional(z.number()).describe("Max results (default 50, max 250)"),
    },
    async (params) => {
      try {
        const result = listComments(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );

  server.tool(
    "save_comment",
    "Create or update a comment. If id is provided, updates the existing comment; otherwise creates a new one. When creating, issueId and body are required.",
    {
      id: z.optional(z.string()).describe("Comment ID. If provided, updates the existing comment"),
      issueId: z.optional(z.string()).describe("Issue ID (required when creating)"),
      body: z.string().describe("Comment body (Markdown)"),
      parentId: z.optional(z.string()).describe("Parent comment ID for threading"),
    },
    async (params) => {
      try {
        const result = saveComment(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );

  server.tool(
    "delete_comment",
    "Delete a comment by ID",
    {
      id: z.string().describe("Comment ID"),
    },
    async (params) => {
      try {
        deleteComment(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: true }) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );

  // ── Attachments ──

  server.tool(
    "get_attachment",
    "Get attachment details by ID",
    {
      id: z.string().describe("Attachment ID"),
    },
    async (params) => {
      const result = getAttachment(db, params);
      if (!result) {
        return { content: [{ type: "text" as const, text: "Attachment not found" }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "create_attachment",
    "Create an attachment for an issue. Content is provided as base64-encoded data.",
    {
      issue: z.string().describe("Issue ID"),
      base64Content: z.string().describe("Base64-encoded file content"),
      filename: z.string().describe("Original filename"),
      contentType: z.string().describe("MIME content type"),
      title: z.optional(z.string()).describe("Attachment title"),
      subtitle: z.optional(z.string()).describe("Attachment subtitle"),
    },
    async (params) => {
      try {
        const result = createAttachment(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );

  server.tool(
    "delete_attachment",
    "Delete an attachment by ID",
    {
      id: z.string().describe("Attachment ID"),
    },
    async (params) => {
      try {
        deleteAttachment(db, params);
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: true }) }] };
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
  registerTeamsTools(mcpServer, db);
  registerUsersTools(mcpServer, db);

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
