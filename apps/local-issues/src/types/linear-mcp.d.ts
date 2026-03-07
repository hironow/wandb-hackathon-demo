/**
 * Linear MCP Tool Type Definitions
 *
 * Generated manually from Linear MCP official tool schemas.
 * When mcporter auth is available, regenerate with:
 *   bunx mcporter emit-ts linear --mode types --out src/types/linear-mcp.d.ts
 */

// ── Common Types ──

export interface PaginationParams {
  cursor?: string;
  limit?: number; // default 50, max 250
  orderBy?: "createdAt" | "updatedAt";
  includeArchived?: boolean;
  createdAt?: string; // ISO-8601 date/duration
  updatedAt?: string; // ISO-8601 date/duration
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor?: string;
}

export interface PaginatedResult<T> {
  nodes: T[];
  pageInfo: PageInfo;
}

// ── Teams ──

export interface ListTeamsParams extends PaginationParams {
  query?: string;
}

export interface GetTeamParams {
  query: string; // UUID, key, or name
}

export interface Team {
  id: string;
  name: string;
  key: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Users ──

export interface ListUsersParams extends PaginationParams {
  query?: string;
  team?: string;
}

export interface GetUserParams {
  query: string; // ID, name, email, or "me"
}

export interface User {
  id: string;
  name: string;
  email: string;
  displayName?: string;
  active: boolean;
  admin: boolean;
}

// ── Issue Statuses ──

export interface ListIssueStatusesParams {
  team?: string;
}

export interface GetIssueStatusParams {
  id?: string;
  name?: string;
  team?: string;
}

export interface IssueStatus {
  id: string;
  name: string;
  type: "backlog" | "unstarted" | "started" | "completed" | "canceled";
  color: string;
  position: number;
  teamId: string;
}

// ── Issue Labels ──

export interface ListIssueLabelsParams extends PaginationParams {
  name?: string;
  team?: string;
}

export interface CreateIssueLabelParams {
  name: string;
  color?: string;
  description?: string;
  parentId?: string;
  teamId?: string;
}

export interface IssueLabel {
  id: string;
  name: string;
  color: string;
  description?: string;
  parentId?: string;
  teamId?: string;
}

// ── Issues ──

export interface ListIssuesParams extends PaginationParams {
  assignee?: string | null;
  state?: string;
  team?: string;
  project?: string;
  label?: string;
  priority?: number; // 0=None, 1=Urgent, 2=High, 3=Normal, 4=Low
  cycle?: string;
  query?: string;
  parentId?: string;
  delegate?: string;
}

export interface GetIssueParams {
  id: string;
  includeRelations?: boolean;
}

export interface SaveIssueParams {
  id?: string; // if provided, updates existing
  title?: string;
  team?: string;
  description?: string;
  assignee?: string;
  state?: string;
  priority?: number;
  estimate?: number;
  labels?: string[];
  project?: string;
  parentId?: string;
  dueDate?: string;
  cycle?: string;
  blocks?: string[];
  blockedBy?: string[];
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priority: { value: number; name: string };
  estimate?: { value: number; name: string };
  url: string;
  gitBranchName: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  completedAt?: string | null;
  dueDate?: string | null;
  status: string;
  labels: string[];
  createdBy: string;
  createdById: string;
  project?: string;
  projectId?: string;
  team: string;
  teamId: string;
  cycleId?: string;
}

// ── Projects ──

export interface ListProjectsParams extends PaginationParams {
  query?: string;
  team?: string;
  state?: string;
  member?: string;
  initiative?: string;
  includeMembers?: boolean;
  includeMilestones?: boolean;
}

export interface GetProjectParams {
  query: string;
  includeMembers?: boolean;
  includeMilestones?: boolean;
  includeResources?: boolean;
}

export interface SaveProjectParams {
  id?: string;
  name?: string;
  team?: string;
  description?: string;
  state?: string;
  icon?: string;
  color?: string;
  lead?: string;
  members?: string[];
  startDate?: string;
  targetDate?: string;
}

export interface ListProjectLabelsParams extends PaginationParams {}

export interface Project {
  id: string;
  name: string;
  description?: string;
  state: string;
  icon?: string;
  color?: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

// ── Milestones ──

export interface GetMilestoneParams {
  id: string;
}

export interface SaveMilestoneParams {
  id?: string;
  name?: string;
  projectId?: string;
  description?: string;
  targetDate?: string;
  sortOrder?: number;
}

export interface Milestone {
  id: string;
  name: string;
  description?: string;
  targetDate?: string;
  sortOrder: number;
  projectId: string;
}

// ── Documents ──

export interface ListDocumentsParams extends PaginationParams {
  query?: string;
  projectId?: string;
  initiativeId?: string;
  creatorId?: string;
}

export interface GetDocumentParams {
  id: string; // id or slug
}

export interface CreateDocumentParams {
  title: string;
  content: string;
  color?: string;
  icon?: string;
  project?: string;
  issue?: string;
}

export interface UpdateDocumentParams {
  id: string;
  title?: string;
  content?: string;
  color?: string;
  icon?: string;
}

export interface Document {
  id: string;
  title: string;
  slug: string;
  content: string;
  color?: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Comments ──

export interface ListCommentsParams {
  issueId: string;
}

export interface SaveCommentParams {
  id?: string;
  issueId?: string;
  body: string;
  parentId?: string;
}

export interface Comment {
  id: string;
  body: string;
  issueId: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Attachments ──

export interface GetAttachmentParams {
  id: string;
}

export interface CreateAttachmentParams {
  issue: string;
  base64Content: string;
  filename: string;
  contentType: string;
  title?: string;
  subtitle?: string;
}

export interface DeleteAttachmentParams {
  id: string;
}

export interface Attachment {
  id: string;
  title?: string;
  subtitle?: string;
  url: string;
  issueId: string;
  createdAt: string;
  updatedAt: string;
}

// ── Cycles ──

export interface ListCyclesParams {
  teamId: string;
  type?: "current" | "previous" | "next";
}

export interface Cycle {
  id: string;
  name?: string;
  number: number;
  startsAt: string;
  endsAt: string;
  teamId: string;
}

// ── Utility ──

export interface ExtractImagesParams {
  markdown: string;
}

export interface SearchDocumentationParams {
  query: string;
  page?: number;
}
