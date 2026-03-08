import { issues, documents } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";

const PAGE_SIZE = 10;

export interface SearchResult {
  title: string;
  content: string | null;
  sourceType: "issue" | "document";
  sourceId: string;
}

export interface SearchResponse {
  items: SearchResult[];
  hasNextPage: boolean;
}

export interface SearchDocumentationParams {
  query: string;
  page?: number;
}

interface RawSqlite {
  run: (sql: string) => void;
  query: (sql: string) => { all: () => unknown[] };
}

function getSqlite(db: AppDatabase): RawSqlite {
  return (db as unknown as { $client: RawSqlite }).$client;
}

export function rebuildSearchIndex(db: AppDatabase): void {
  const sqlite = getSqlite(db);

  // Clear existing index
  sqlite.run("DELETE FROM search_index");

  // Index all issues
  const allIssues = db.select().from(issues).all();
  for (const issue of allIssues) {
    sqlite.run(
      `INSERT INTO search_index (title, content, source_type, source_id) VALUES ('${escape(issue.title)}', '${escape(issue.description ?? "")}', 'issue', '${escape(issue.id)}')`,
    );
  }

  // Index all documents
  const allDocs = db.select().from(documents).all();
  for (const doc of allDocs) {
    sqlite.run(
      `INSERT INTO search_index (title, content, source_type, source_id) VALUES ('${escape(doc.title)}', '${escape(doc.content ?? "")}', 'document', '${escape(doc.id)}')`,
    );
  }
}

function escape(str: string): string {
  return str.replace(/'/g, "''");
}

export function searchDocumentation(
  db: AppDatabase,
  params: SearchDocumentationParams,
): SearchResponse {
  if (!params.query || params.query.trim() === "") {
    return { items: [], hasNextPage: false };
  }

  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * PAGE_SIZE;
  const sqlite = getSqlite(db);

  const escapedQuery = escape(params.query.trim());

  const rows = sqlite
    .query(
      `SELECT title, content, source_type, source_id FROM search_index WHERE search_index MATCH '${escapedQuery}' LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}`,
    )
    .all() as Array<{ title: string; content: string | null; source_type: string; source_id: string }>;

  const hasNextPage = rows.length > PAGE_SIZE;
  const items = (hasNextPage ? rows.slice(0, PAGE_SIZE) : rows).map((row) => ({
    title: row.title,
    content: row.content,
    sourceType: row.source_type as "issue" | "document",
    sourceId: row.source_id,
  }));

  return { items, hasNextPage };
}
