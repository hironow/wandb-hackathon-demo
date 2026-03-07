import { eq, and, like, desc, asc, sql } from "drizzle-orm";
import { issues, issueStatuses, issueToLabels, issueLabels, issueRelations, teams, teamSequences } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";
import type {
  SaveIssueParams,
  GetIssueParams,
  ListIssuesParams,
  Issue,
  PaginatedResult,
} from "../types/linear-mcp.d.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

const PRIORITY_NAMES: Record<number, string> = {
  0: "None",
  1: "Urgent",
  2: "High",
  3: "Normal",
  4: "Low",
};

function priorityName(value: number): string {
  return PRIORITY_NAMES[value] ?? "None";
}

function getNextSequenceNumber(db: AppDatabase, teamId: string): number {
  // Upsert: insert row with default(1) if absent, then read+increment atomically
  db.insert(teamSequences)
    .values({ teamId, nextNumber: 1 })
    .onConflictDoNothing()
    .run();

  const row = db
    .select({ nextNumber: teamSequences.nextNumber })
    .from(teamSequences)
    .where(eq(teamSequences.teamId, teamId))
    .get();

  const current = row!.nextNumber;

  db.update(teamSequences)
    .set({ nextNumber: current + 1 })
    .where(eq(teamSequences.teamId, teamId))
    .run();

  return current;
}

function getTeamKey(db: AppDatabase, teamId: string): string {
  const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
  if (!team) throw new Error(`Team not found: ${teamId}`);
  return team.key;
}

function resolveStateId(db: AppDatabase, stateNameOrId: string, teamId: string): string {
  // Try by ID first
  const byId = db.select().from(issueStatuses).where(eq(issueStatuses.id, stateNameOrId)).get();
  if (byId) return byId.id;

  // Try by name within team
  const byName = db
    .select()
    .from(issueStatuses)
    .where(and(eq(issueStatuses.name, stateNameOrId), eq(issueStatuses.teamId, teamId)))
    .get();
  if (byName) return byName.id;

  throw new Error(`Issue status not found: ${stateNameOrId}`);
}

function getDefaultStateId(db: AppDatabase, teamId: string): string {
  const backlog = db
    .select()
    .from(issueStatuses)
    .where(and(eq(issueStatuses.type, "backlog"), eq(issueStatuses.teamId, teamId)))
    .get();
  if (backlog) return backlog.id;

  // Fallback to first status
  const first = db
    .select()
    .from(issueStatuses)
    .where(eq(issueStatuses.teamId, teamId))
    .orderBy(asc(issueStatuses.position))
    .get();
  if (first) return first.id;

  throw new Error(`No issue statuses found for team: ${teamId}`);
}

function getStatusName(db: AppDatabase, stateId: string): string {
  const status = db.select().from(issueStatuses).where(eq(issueStatuses.id, stateId)).get();
  return status?.name ?? "Unknown";
}

function getLabelsForIssue(db: AppDatabase, issueId: string): string[] {
  const rows = db
    .select({ name: issueLabels.name })
    .from(issueToLabels)
    .innerJoin(issueLabels, eq(issueToLabels.labelId, issueLabels.id))
    .where(eq(issueToLabels.issueId, issueId))
    .all();
  return rows.map((r) => r.name);
}

function getTeamName(db: AppDatabase, teamId: string): string {
  const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
  return team?.name ?? "Unknown";
}

function toIssue(
  db: AppDatabase,
  row: typeof issues.$inferSelect,
): Issue {
  const labels = getLabelsForIssue(db, row.id);
  const teamName = getTeamName(db, row.teamId);

  return {
    id: row.id,
    identifier: row.identifier,
    title: row.title,
    description: row.description ?? undefined,
    priority: { value: row.priority, name: priorityName(row.priority) },
    estimate: row.estimate != null ? { value: row.estimate, name: `${row.estimate} Points` } : undefined,
    url: `local://issues/${row.identifier}`,
    gitBranchName: `${row.identifier.toLowerCase()}-${row.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}`,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: null,
    completedAt: null,
    dueDate: row.dueDate ?? null,
    status: getStatusName(db, row.stateId),
    labels,
    createdBy: "Local User",
    createdById: "local-user",
    project: undefined,
    projectId: row.projectId ?? undefined,
    team: teamName,
    teamId: row.teamId,
    cycleId: row.cycleId ?? undefined,
  };
}

export function saveIssue(db: AppDatabase, params: SaveIssueParams): Issue {
  if (params.id) {
    return updateIssue(db, params);
  }
  return createIssue(db, params);
}

function createIssue(db: AppDatabase, params: SaveIssueParams): Issue {
  if (!params.title) throw new Error("Title is required when creating an issue");
  if (!params.team) throw new Error("Team is required when creating an issue");

  const teamId = params.team;
  const teamKey = getTeamKey(db, teamId);
  const seqNum = getNextSequenceNumber(db, teamId);
  const identifier = `${teamKey}-${seqNum}`;

  const stateId = params.state
    ? resolveStateId(db, params.state, teamId)
    : getDefaultStateId(db, teamId);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const row = {
    id,
    identifier,
    title: params.title,
    description: params.description ?? null,
    priority: params.priority ?? 0,
    estimate: params.estimate ?? null,
    dueDate: params.dueDate ?? null,
    stateId,
    assigneeId: params.assignee ?? null,
    teamId,
    projectId: params.project ?? null,
    parentId: params.parentId ?? null,
    cycleId: params.cycle ?? null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(issues).values(row).run();

  // Handle labels
  if (params.labels && params.labels.length > 0) {
    setIssueLabels(db, id, params.labels);
  }

  // Handle relations
  if (params.blocks && params.blocks.length > 0) {
    addRelations(db, id, params.blocks, "blocks");
  }
  if (params.blockedBy && params.blockedBy.length > 0) {
    addRelations(db, id, params.blockedBy, "blocked_by");
  }

  return toIssue(db, { ...row, description: row.description, dueDate: row.dueDate, estimate: row.estimate, assigneeId: row.assigneeId, projectId: row.projectId, parentId: row.parentId, cycleId: row.cycleId });
}

function updateIssue(db: AppDatabase, params: SaveIssueParams): Issue {
  const existing = db.select().from(issues).where(eq(issues.id, params.id!)).get();
  if (!existing) throw new Error(`Issue not found: ${params.id}`);

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (params.title !== undefined) updates.title = params.title;
  if (params.description !== undefined) updates.description = params.description;
  if (params.priority !== undefined) updates.priority = params.priority;
  if (params.estimate !== undefined) updates.estimate = params.estimate;
  if (params.dueDate !== undefined) updates.dueDate = params.dueDate;
  if (params.assignee !== undefined) updates.assigneeId = params.assignee;
  if (params.project !== undefined) updates.projectId = params.project;
  if (params.parentId !== undefined) updates.parentId = params.parentId;
  if (params.cycle !== undefined) updates.cycleId = params.cycle;

  if (params.state !== undefined) {
    updates.stateId = resolveStateId(db, params.state, existing.teamId);
  }

  db.update(issues).set(updates).where(eq(issues.id, params.id!)).run();

  // Handle labels
  if (params.labels !== undefined) {
    setIssueLabels(db, params.id!, params.labels);
  }

  // Handle relations (append-only)
  if (params.blocks && params.blocks.length > 0) {
    addRelations(db, params.id!, params.blocks, "blocks");
  }
  if (params.blockedBy && params.blockedBy.length > 0) {
    addRelations(db, params.id!, params.blockedBy, "blocked_by");
  }

  const updated = db.select().from(issues).where(eq(issues.id, params.id!)).get();
  return toIssue(db, updated!);
}

function setIssueLabels(db: AppDatabase, issueId: string, labelNamesOrIds: string[]): void {
  // Clear existing labels
  db.delete(issueToLabels).where(eq(issueToLabels.issueId, issueId)).run();

  for (const nameOrId of labelNamesOrIds) {
    // Try by ID
    let label = db.select().from(issueLabels).where(eq(issueLabels.id, nameOrId)).get();
    // Try by name
    if (!label) {
      label = db.select().from(issueLabels).where(eq(issueLabels.name, nameOrId)).get();
    }
    if (label) {
      db.insert(issueToLabels)
        .values({ issueId, labelId: label.id })
        .onConflictDoNothing()
        .run();
    }
  }
}

function addRelations(
  db: AppDatabase,
  issueId: string,
  relatedIds: string[],
  type: string,
): void {
  for (const relatedId of relatedIds) {
    // Resolve identifier to ID if needed
    let resolvedId = relatedId;
    const byIdentifier = db.select().from(issues).where(eq(issues.identifier, relatedId)).get();
    if (byIdentifier) resolvedId = byIdentifier.id;

    db.insert(issueRelations)
      .values({ issueId, relatedIssueId: resolvedId, type })
      .onConflictDoNothing()
      .run();
  }
}

export function getIssue(db: AppDatabase, params: GetIssueParams): Issue | null {
  // Try by ID
  let row = db.select().from(issues).where(eq(issues.id, params.id)).get();

  // Try by identifier
  if (!row) {
    row = db.select().from(issues).where(eq(issues.identifier, params.id)).get();
  }

  if (!row) return null;

  const issue = toIssue(db, row);

  // Include relations if requested
  if (params.includeRelations) {
    const relations = getRelations(db, row.id);
    return { ...issue, ...relations } as Issue;
  }

  return issue;
}

function getRelations(db: AppDatabase, issueId: string) {
  const rels = db.select().from(issueRelations).where(eq(issueRelations.issueId, issueId)).all();

  const blocks: Array<{ id: string; identifier: string; title: string }> = [];
  const blockedBy: Array<{ id: string; identifier: string; title: string }> = [];
  const relatedTo: Array<{ id: string; identifier: string; title: string }> = [];

  for (const rel of rels) {
    const related = db.select().from(issues).where(eq(issues.id, rel.relatedIssueId)).get();
    if (!related) continue;

    const entry = { id: related.id, identifier: related.identifier, title: related.title };
    if (rel.type === "blocks") blocks.push(entry);
    else if (rel.type === "blocked_by") blockedBy.push(entry);
    else if (rel.type === "related") relatedTo.push(entry);
  }

  return { relations: { blocks, blockedBy, relatedTo } };
}

export function listIssues(
  db: AppDatabase,
  params: ListIssuesParams,
): PaginatedResult<Issue> {
  const conditions = [];

  if (params.team) {
    conditions.push(eq(issues.teamId, params.team));
  }

  if (params.state) {
    // Resolve state name to ID
    const stateRows = db
      .select()
      .from(issueStatuses)
      .where(eq(issueStatuses.name, params.state))
      .all();
    if (stateRows.length > 0) {
      const stateIds = stateRows.map((s) => s.id);
      conditions.push(sql`${issues.stateId} IN (${sql.join(stateIds.map(id => sql`${id}`), sql`, `)})`);
    }
  }

  if (params.assignee) {
    conditions.push(eq(issues.assigneeId, params.assignee));
  }

  if (params.project) {
    conditions.push(eq(issues.projectId, params.project));
  }

  if (params.priority !== undefined) {
    conditions.push(eq(issues.priority, params.priority));
  }

  if (params.query) {
    conditions.push(like(issues.title, `%${params.query}%`));
  }

  if (params.parentId) {
    conditions.push(eq(issues.parentId, params.parentId));
  }

  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const orderColumn =
    params.orderBy === "createdAt" ? issues.createdAt : issues.updatedAt;

  const rows = db
    .select()
    .from(issues)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(orderColumn))
    .limit(limit + 1)
    .all();

  const hasNextPage = rows.length > limit;
  const items = (hasNextPage ? rows.slice(0, limit) : rows).map((row) => toIssue(db, row));

  return { items, hasNextPage };
}
