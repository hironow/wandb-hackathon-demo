import { eq, asc } from "drizzle-orm";
import { milestones, projects } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";
import type {
  SaveMilestoneParams,
  GetMilestoneParams,
  Milestone,
} from "../types/linear-mcp.d.ts";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDate(value: string): void {
  if (!ISO_DATE_RE.test(value)) {
    throw new Error(`Invalid date format: ${value}. Expected ISO 8601 (YYYY-MM-DD)`);
  }
}

function validateProjectExists(db: AppDatabase, projectId: string): void {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
}

function toMilestone(row: typeof milestones.$inferSelect): Milestone {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    targetDate: row.targetDate ?? undefined,
    sortOrder: row.sortOrder,
    projectId: row.projectId,
  };
}

export function saveMilestone(db: AppDatabase, params: SaveMilestoneParams): Milestone {
  if (params.id) {
    return updateMilestone(db, params);
  }
  return createMilestone(db, params);
}

function createMilestone(db: AppDatabase, params: SaveMilestoneParams): Milestone {
  if (!params.name) throw new Error("name is required when creating a milestone");
  if (!params.projectId) throw new Error("projectId is required when creating a milestone");

  validateProjectExists(db, params.projectId);

  if (params.targetDate) validateDate(params.targetDate);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const row = {
    id,
    name: params.name,
    description: params.description ?? null,
    targetDate: params.targetDate ?? null,
    sortOrder: params.sortOrder ?? 0,
    projectId: params.projectId,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(milestones).values(row).run();

  return toMilestone(row);
}

function updateMilestone(db: AppDatabase, params: SaveMilestoneParams): Milestone {
  const existing = db.select().from(milestones).where(eq(milestones.id, params.id!)).get();
  if (!existing) throw new Error(`Milestone not found: ${params.id}`);

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.sortOrder !== undefined) updates.sortOrder = params.sortOrder;

  if (params.targetDate !== undefined) {
    if (params.targetDate) validateDate(params.targetDate);
    updates.targetDate = params.targetDate;
  }

  db.update(milestones).set(updates).where(eq(milestones.id, params.id!)).run();

  const updated = db.select().from(milestones).where(eq(milestones.id, params.id!)).get();
  return toMilestone(updated!);
}

export function getMilestone(db: AppDatabase, params: GetMilestoneParams): Milestone | null {
  const row = db.select().from(milestones).where(eq(milestones.id, params.id)).get();
  if (!row) return null;
  return toMilestone(row);
}

export function listMilestones(
  db: AppDatabase,
  params: { projectId: string },
): Milestone[] {
  const rows = db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, params.projectId))
    .orderBy(asc(milestones.sortOrder))
    .all();

  return rows.map(toMilestone);
}
