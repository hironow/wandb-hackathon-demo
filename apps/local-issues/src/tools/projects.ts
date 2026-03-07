import { eq, and, like, desc, asc, isNull } from "drizzle-orm";
import { projects, projectLabels } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";
import type {
  SaveProjectParams,
  GetProjectParams,
  ListProjectsParams,
  ListProjectLabelsParams,
  CreateProjectLabelParams,
  DeleteProjectLabelParams,
  Project,
  ProjectLabel,
  PaginatedResult,
} from "../types/linear-mcp.d.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

const VALID_STATES = ["planned", "started", "paused", "completed", "canceled"] as const;

// State transition rules: from -> allowed destinations
const STATE_TRANSITIONS: Record<string, string[]> = {
  planned: ["started", "canceled"],
  started: ["paused", "completed", "canceled"],
  paused: ["started", "canceled"],
  completed: ["started"],
  canceled: ["planned"],
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDate(value: string): void {
  if (!ISO_DATE_RE.test(value)) {
    throw new Error(`Invalid date format: ${value}. Expected ISO 8601 (YYYY-MM-DD)`);
  }
}

function validateStateTransition(from: string, to: string): void {
  const allowed = STATE_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    const validPaths = STATE_TRANSITIONS[from] ?? [];
    throw new Error(
      `Invalid state transition: ${from} -> ${to}. Allowed transitions from '${from}': ${validPaths.join(", ") || "none"}`,
    );
  }
}

function toProject(row: typeof projects.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    state: row.state,
    icon: row.icon ?? undefined,
    color: row.color ?? undefined,
    archivedAt: row.archivedAt ?? undefined,
    url: `local://projects/${row.id}`,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function saveProject(db: AppDatabase, params: SaveProjectParams): Project {
  if (params.id) {
    return updateProject(db, params);
  }
  return createProject(db, params);
}

function createProject(db: AppDatabase, params: SaveProjectParams): Project {
  if (!params.name) throw new Error("name is required when creating a project");
  if (!params.team) throw new Error("team (teamId) is required when creating a project");

  // Check for duplicate name
  const existing = db
    .select()
    .from(projects)
    .where(eq(projects.name, params.name))
    .get();
  if (existing) {
    throw new Error(`A project with duplicate name already exists: ${params.name}`);
  }

  if (params.state && !VALID_STATES.includes(params.state as typeof VALID_STATES[number])) {
    throw new Error(`Invalid state: ${params.state}. Valid states: ${VALID_STATES.join(", ")}`);
  }

  if (params.startDate) validateDate(params.startDate);
  if (params.targetDate) validateDate(params.targetDate);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const row = {
    id,
    name: params.name,
    description: params.description ?? null,
    icon: params.icon ?? null,
    color: params.color ?? null,
    state: params.state ?? "planned",
    priority: 0,
    startDate: params.startDate ?? null,
    targetDate: params.targetDate ?? null,
    leadId: params.lead ?? null,
    teamId: params.team,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(projects).values(row).run();

  return toProject({
    ...row,
    description: row.description,
    icon: row.icon,
    color: row.color,
    startDate: row.startDate,
    targetDate: row.targetDate,
    archivedAt: null,
    leadId: row.leadId,
    teamId: row.teamId,
  });
}

function updateProject(db: AppDatabase, params: SaveProjectParams): Project {
  const existing = db.select().from(projects).where(eq(projects.id, params.id!)).get();
  if (!existing) throw new Error(`Project not found: ${params.id}`);

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (params.name !== undefined) {
    // Check for duplicate name (excluding self)
    const dup = db
      .select()
      .from(projects)
      .where(and(eq(projects.name, params.name), eq(projects.id, params.id!)))
      .get();
    // Only check if there's another project with the same name
    const other = db
      .select()
      .from(projects)
      .where(eq(projects.name, params.name))
      .get();
    if (other && other.id !== params.id) {
      throw new Error(`A project with duplicate name already exists: ${params.name}`);
    }
    updates.name = params.name;
  }

  if (params.description !== undefined) updates.description = params.description;
  if (params.icon !== undefined) updates.icon = params.icon;
  if (params.color !== undefined) updates.color = params.color;
  if (params.lead !== undefined) updates.leadId = params.lead;

  if (params.startDate !== undefined) {
    if (params.startDate) validateDate(params.startDate);
    updates.startDate = params.startDate;
  }

  if (params.targetDate !== undefined) {
    if (params.targetDate) validateDate(params.targetDate);
    updates.targetDate = params.targetDate;
  }

  if (params.state !== undefined) {
    if (!VALID_STATES.includes(params.state as typeof VALID_STATES[number])) {
      throw new Error(`Invalid state: ${params.state}. Valid states: ${VALID_STATES.join(", ")}`);
    }
    validateStateTransition(existing.state, params.state);
    updates.state = params.state;
  }

  if (params.archived !== undefined) {
    updates.archivedAt = params.archived ? new Date().toISOString() : null;
  }

  db.update(projects).set(updates).where(eq(projects.id, params.id!)).run();

  const updated = db.select().from(projects).where(eq(projects.id, params.id!)).get();
  return toProject(updated!);
}

export function getProject(db: AppDatabase, params: GetProjectParams): Project | null {
  // Try by ID
  let row = db.select().from(projects).where(eq(projects.id, params.query)).get();

  // Try by name
  if (!row) {
    row = db.select().from(projects).where(eq(projects.name, params.query)).get();
  }

  if (!row) return null;
  return toProject(row);
}

export function listProjects(
  db: AppDatabase,
  params: ListProjectsParams,
): PaginatedResult<Project> {
  const conditions = [];

  if (params.team) {
    conditions.push(eq(projects.teamId, params.team));
  }

  if (params.state) {
    conditions.push(eq(projects.state, params.state));
  }

  if (params.query) {
    conditions.push(like(projects.name, `%${params.query}%`));
  }

  if (!params.includeArchived) {
    conditions.push(isNull(projects.archivedAt));
  }

  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const orderColumn =
    params.orderBy === "createdAt" ? projects.createdAt : projects.updatedAt;

  const rows = db
    .select()
    .from(projects)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(orderColumn))
    .limit(limit + 1)
    .all();

  const hasNextPage = rows.length > limit;
  const items = (hasNextPage ? rows.slice(0, limit) : rows).map(toProject);

  return { items, hasNextPage };
}

function toProjectLabel(row: typeof projectLabels.$inferSelect): ProjectLabel {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    description: row.description ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listProjectLabels(
  db: AppDatabase,
  params: ListProjectLabelsParams,
): PaginatedResult<ProjectLabel> {
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const orderColumn =
    params.orderBy === "createdAt" ? projectLabels.createdAt : projectLabels.updatedAt;

  const rows = db
    .select()
    .from(projectLabels)
    .orderBy(desc(orderColumn))
    .limit(limit + 1)
    .all();

  const hasNextPage = rows.length > limit;
  const items = (hasNextPage ? rows.slice(0, limit) : rows).map(toProjectLabel);

  return { items, hasNextPage };
}

export function createProjectLabel(
  db: AppDatabase,
  params: CreateProjectLabelParams,
): ProjectLabel {
  if (!params.name || params.name.trim() === "") {
    throw new Error("Label name is required and cannot be empty");
  }

  const existing = db
    .select()
    .from(projectLabels)
    .where(eq(projectLabels.name, params.name))
    .get();

  if (existing) {
    throw new Error(`Project label "${params.name}" already exists`);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const row = {
    id,
    name: params.name,
    color: params.color ?? null,
    description: params.description ?? null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(projectLabels).values(row).run();

  return toProjectLabel(row);
}

export function deleteProjectLabel(
  db: AppDatabase,
  params: DeleteProjectLabelParams,
): { success: boolean } {
  const existing = db
    .select()
    .from(projectLabels)
    .where(eq(projectLabels.id, params.id))
    .get();

  if (!existing) {
    throw new Error(`Project label not found: ${params.id}`);
  }

  db.delete(projectLabels).where(eq(projectLabels.id, params.id)).run();

  return { success: true };
}
