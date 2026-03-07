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

export interface SearchError {
  code: string;
  message: string;
}

export interface SearchResponse {
  items: SearchResult[];
  total_count: number;
  page: number;
  page_size: number;
  hasNextPage: boolean;
  error?: SearchError;
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

function containsNonAscii(str: string): boolean {
  return /[^\x00-\x7F]/.test(str);
}

function ftsSearch(
  sqlite: RawSqlite,
  query: string,
  pageSize: number,
  offset: number,
): { items: SearchResult[]; totalCount: number } | { error: SearchError } {
  const escapedQuery = escape(query);
  try {
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

    const items = rows.map((row) => ({
      title: row.title,
      content: row.content,
      sourceType: row.source_type as "issue" | "document",
      sourceId: row.source_id,
    }));

    return { items, totalCount };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: { code: "INVALID_QUERY", message } };
  }
}

function likeFallbackSearch(
  db: AppDatabase,
  query: string,
  pageSize: number,
  offset: number,
): { items: SearchResult[]; totalCount: number } {
  const issueRows = db
    .select({ id: issues.id, title: issues.title, description: issues.description })
    .from(issues)
    .all()
    .filter((row) => row.title.includes(query) || (row.description ?? "").includes(query));

  const docRows = db
    .select({ id: documents.id, title: documents.title, content: documents.content })
    .from(documents)
    .all()
    .filter((row) => row.title.includes(query) || (row.content ?? "").includes(query));

  const allResults: SearchResult[] = [
    ...issueRows.map((row) => ({
      title: row.title,
      content: row.description,
      sourceType: "issue" as const,
      sourceId: row.id,
    })),
    ...docRows.map((row) => ({
      title: row.title,
      content: row.content,
      sourceType: "document" as const,
      sourceId: row.id,
    })),
  ];

  const totalCount = allResults.length;
  const items = allResults.slice(offset, offset + pageSize);

  return { items, totalCount };
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
  const trimmedQuery = params.query.trim();
  const sqlite = getSqlite(db);

  // Try FTS5 search first
  const ftsResult = ftsSearch(sqlite, trimmedQuery, pageSize, offset);

  // If FTS5 query is invalid, return error response
  if ("error" in ftsResult) {
    return {
      items: [],
      total_count: 0,
      page,
      page_size: pageSize,
      hasNextPage: false,
      error: ftsResult.error,
    };
  }

  // If FTS5 returned results, use them
  if (ftsResult.totalCount > 0) {
    const hasNextPage = offset + ftsResult.items.length < ftsResult.totalCount;
    return {
      items: ftsResult.items,
      total_count: ftsResult.totalCount,
      page,
      page_size: pageSize,
      hasNextPage,
    };
  }

  // FTS5 returned 0 results — try LIKE fallback for non-ASCII (Japanese) queries
  if (containsNonAscii(trimmedQuery)) {
    const likeResult = likeFallbackSearch(db, trimmedQuery, pageSize, offset);
    const hasNextPage = offset + likeResult.items.length < likeResult.totalCount;
    return {
      items: likeResult.items,
      total_count: likeResult.totalCount,
      page,
      page_size: pageSize,
      hasNextPage,
    };
  }

  // FTS5 returned 0, query is ASCII-only — no fallback needed
  const hasNextPage = offset + ftsResult.items.length < ftsResult.totalCount;
  return {
    items: ftsResult.items,
    total_count: ftsResult.totalCount,
    page,
    page_size: pageSize,
    hasNextPage,
  };
}
