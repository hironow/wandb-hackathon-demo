import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppDatabase } from "../db/client.ts";
import { listTeams, getTeam } from "./teams.ts";
import { listUsers, getUser } from "./users.ts";

export function registerTeamsTools(server: McpServer, db: AppDatabase): void {
  server.tool(
    "list_teams",
    "List teams in the workspace",
    {
      query: z.string().optional().describe("Search by team name or key"),
      cursor: z.string().optional().describe("Pagination cursor"),
      limit: z.number().min(1).max(250).optional().describe("Max results (default 50, max 250)"),
      orderBy: z.enum(["createdAt", "updatedAt"]).optional().describe("Sort field"),
      includeArchived: z.boolean().optional().describe("Include archived items"),
      createdAt: z.string().optional().describe("Created after: ISO-8601 date/duration"),
      updatedAt: z.string().optional().describe("Updated after: ISO-8601 date/duration"),
    },
    (params) => {
      const result = listTeams(db, params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  );

  server.tool(
    "get_team",
    "Get team details by UUID, key, or name",
    {
      query: z.string().describe("Team UUID, key, or name"),
    },
    (params) => {
      const result = getTeam(db, params);
      if (!result) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Team not found: ${params.query}` }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  );
}

export function registerUsersTools(server: McpServer, db: AppDatabase): void {
  server.tool(
    "list_users",
    "List users in the workspace",
    {
      query: z.string().optional().describe("Search by user name or email"),
      team: z.string().optional().describe("Filter by team name or ID"),
      cursor: z.string().optional().describe("Pagination cursor"),
      limit: z.number().min(1).max(250).optional().describe("Max results (default 50, max 250)"),
      orderBy: z.enum(["createdAt", "updatedAt"]).optional().describe("Sort field"),
      createdAt: z.string().optional().describe("Created after: ISO-8601 date/duration"),
      updatedAt: z.string().optional().describe("Updated after: ISO-8601 date/duration"),
    },
    (params) => {
      const result = listUsers(db, params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  );

  server.tool(
    "get_user",
    "Get user details by ID, name, email, or 'me'",
    {
      query: z.string().describe("User ID, name, email, or 'me'"),
    },
    (params) => {
      try {
        const result = getUser(db, params);
        if (!result) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `User not found: ${params.query}` }) }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );
}

export function registerAllTools(server: McpServer, db: AppDatabase): void {
  registerTeamsTools(server, db);
  registerUsersTools(server, db);
}
