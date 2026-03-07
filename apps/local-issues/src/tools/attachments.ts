import { eq } from "drizzle-orm";
import { attachments, issues } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";
import type {
  CreateAttachmentParams,
  GetAttachmentParams,
  DeleteAttachmentParams,
  Attachment,
} from "../types/linear-mcp.d.ts";
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_ATTACHMENTS_DIR = "data/attachments";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
]);

function toAttachment(row: typeof attachments.$inferSelect): Attachment {
  return {
    id: row.id,
    title: row.title ?? undefined,
    subtitle: row.subtitle ?? undefined,
    url: row.url,
    issueId: row.issueId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function assertIssueExists(db: AppDatabase, issueId: string): void {
  const issue = db.select().from(issues).where(eq(issues.id, issueId)).get();
  if (!issue) {
    const byIdentifier = db.select().from(issues).where(eq(issues.identifier, issueId)).get();
    if (!byIdentifier) {
      throw new Error(`Issue not found: ${issueId}`);
    }
  }
}

function decodeBase64(content: string): Buffer {
  // Validate base64 before decoding
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(content) || content.length === 0) {
    throw new Error("Invalid base64 content: not a valid base64 string");
  }

  const buffer = Buffer.from(content, "base64");

  // Double-check: re-encode and compare to detect corruption
  const reEncoded = buffer.toString("base64");
  if (reEncoded !== content) {
    throw new Error("Invalid base64 content: decoded content does not match input");
  }

  return buffer;
}

export function createAttachment(
  db: AppDatabase,
  params: CreateAttachmentParams,
  attachmentsDir: string = DEFAULT_ATTACHMENTS_DIR,
): Attachment {
  assertIssueExists(db, params.issue);

  if (!ALLOWED_CONTENT_TYPES.has(params.contentType)) {
    throw new Error(
      `Content type "${params.contentType}" not allowed. Allowed types: ${[...ALLOWED_CONTENT_TYPES].join(", ")}`,
    );
  }

  const decoded = decodeBase64(params.base64Content);

  if (decoded.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File size exceeds 10MB limit (${decoded.length} bytes). Maximum allowed: ${MAX_FILE_SIZE_BYTES} bytes`,
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Save file to disk: {attachmentsDir}/{issue_id}/{attachment_id}_{filename}
  const issueDir = join(attachmentsDir, params.issue);
  mkdirSync(issueDir, { recursive: true, mode: 0o755 });
  const filePath = join(issueDir, `${id}_${params.filename}`);
  writeFileSync(filePath, decoded);

  const row = {
    id,
    title: params.title ?? null,
    subtitle: params.subtitle ?? null,
    url: filePath,
    issueId: params.issue,
    metadata: JSON.stringify({ contentType: params.contentType, filename: params.filename }),
    createdAt: now,
    updatedAt: now,
  };

  db.insert(attachments).values(row).run();

  return toAttachment(row);
}

export function getAttachment(db: AppDatabase, params: GetAttachmentParams): Attachment | null {
  const row = db.select().from(attachments).where(eq(attachments.id, params.id)).get();
  if (!row) return null;
  return toAttachment(row);
}

export function deleteAttachment(db: AppDatabase, params: DeleteAttachmentParams): void {
  const existing = db.select().from(attachments).where(eq(attachments.id, params.id)).get();
  if (!existing) throw new Error(`Attachment not found: ${params.id}`);

  // DB record deletion first (at-least-once: DB deletion is the source of truth)
  db.delete(attachments).where(eq(attachments.id, params.id)).run();

  // File deletion with warning on failure (at-least-once tolerance)
  try {
    if (existsSync(existing.url)) {
      unlinkSync(existing.url);
    }
  } catch (err) {
    console.error(
      `Warning: failed to delete attachment file ${existing.url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
