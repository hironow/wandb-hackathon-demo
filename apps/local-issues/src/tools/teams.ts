import { eq, or, like, desc, sql, gte, isNull } from "drizzle-orm";
import { teams } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";
import type {
  ListTeamsParams,
  GetTeamParams,
  Team,
  PaginatedResult,
} from "../types/linear-mcp.d.ts";

const DEFAULT_LIMIT = 50;

function toTeam(row: typeof teams.$inferSelect): Team {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    icon: row.icon ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listTeams(
  db: AppDatabase,
  params: ListTeamsParams,
): PaginatedResult<Team> {
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, 250);
  const orderCol =
    params.orderBy === "createdAt" ? teams.createdAt : teams.updatedAt;

  let query = db.select().from(teams);

  // Filter by query (search name or key)
  if (params.query) {
    const pattern = `%${params.query}%`;
    query = query.where(
      or(like(teams.name, pattern), like(teams.key, pattern)),
    ) as typeof query;
  }

  // Date filters
  if (params.createdAt) {
    query = query.where(gte(teams.createdAt, params.createdAt)) as typeof query;
  }
  if (params.updatedAt) {
    query = query.where(gte(teams.updatedAt, params.updatedAt)) as typeof query;
  }

  // Archive filter (default: include archived)
  if (params.includeArchived === false) {
    query = query.where(isNull(teams.archivedAt)) as typeof query;
  }

  // Cursor-based pagination (DESC order): cursor marks the last seen item
  if (params.cursor) {
    const [cursorTime, cursorId] = decodeCursor(params.cursor);
    if (cursorTime && cursorId) {
      query = query.where(
        sql`(${orderCol}, ${teams.id}) < (${cursorTime}, ${cursorId})`,
      ) as typeof query;
    }
  }

  const rows = query
    .orderBy(desc(orderCol), desc(teams.id))
    .limit(limit + 1)
    .all();

  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const nodes = pageRows.map(toTeam);
  const lastNode = nodes[nodes.length - 1];

  return {
    nodes,
    pageInfo: {
      hasNextPage,
      endCursor:
        hasNextPage && lastNode
          ? encodeCursor(
              params.orderBy === "createdAt"
                ? lastNode.createdAt
                : lastNode.updatedAt,
              lastNode.id,
            )
          : undefined,
    },
  };
}

export function getTeam(
  db: AppDatabase,
  params: GetTeamParams,
): Team | null {
  // Try matching by id, key, or name
  const row = db
    .select()
    .from(teams)
    .where(
      or(
        eq(teams.id, params.query),
        eq(teams.key, params.query),
        eq(teams.name, params.query),
      ),
    )
    .limit(1)
    .all()[0];

  return row ? toTeam(row) : null;
}

// Cursor encoding/decoding
function encodeCursor(time: string, id: string): string {
  return Buffer.from(`${time}|${id}`).toString("base64");
}

function decodeCursor(cursor: string): [string | undefined, string | undefined] {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const [time, id] = decoded.split("|");
    return [time, id];
  } catch {
    return [undefined, undefined];
  }
}
