import { issues, documents } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface SearchResult {
  title: string;
  content: string | null;
  sourceType: "issue" | "document";
  sourceId: string;
}

export interface SearchResponse {
  items: SearchResult[];
  total_count: number;
  page: number;
  page_size: number;
  hasNextPage: boolean;
}

export interface SearchDocumentationParams {
  query: string;
  page?: number;
  page_size?: number;
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
  const pageSize = Math.min(Math.max(1, params.page_size ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const page = Math.max(1, params.page ?? 1);

  if (!params.query || params.query.trim() === "") {
    return { items: [], total_count: 0, page, page_size: pageSize, hasNextPage: false };
  }

  const offset = (page - 1) * pageSize;
  const sqlite = getSqlite(db);

  const escapedQuery = escape(params.query.trim());

  const countRows = sqlite
    .query(
      `SELECT COUNT(*) as cnt FROM search_index WHERE search_index MATCH '${escapedQuery}'`,
    )
    .all() as Array<{ cnt: number }>;
  const totalCount = countRows[0]?.cnt ?? 0;

  const rows = sqlite
    .query(
      `SELECT title, content, source_type, source_id FROM search_index WHERE search_index MATCH '${escapedQuery}' LIMIT ${pageSize} OFFSET ${offset}`,
    )
    .all() as Array<{ title: string; content: string | null; source_type: string; source_id: string }>;

  const hasNextPage = offset + rows.length < totalCount;
  const items = rows.map((row) => ({
    title: row.title,
    content: row.content,
    sourceType: row.source_type as "issue" | "document",
    sourceId: row.source_id,
  }));

  return { items, total_count: totalCount, page, page_size: pageSize, hasNextPage };
}
