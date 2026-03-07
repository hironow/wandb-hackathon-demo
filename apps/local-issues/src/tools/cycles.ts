import { eq, and, lte, gte, gt, lt, isNotNull } from "drizzle-orm";
import { cycles } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";

export function validateCycleDates(
  startsAt: string | null,
  endsAt: string | null,
): void {
  if (startsAt !== null && endsAt !== null && startsAt > endsAt) {
    throw new Error("start_date must not be after end_date");
  }
}

export interface Cycle {
  id: string;
  name: string | null;
  number: number;
  teamId: string;
  startsAt: string | null;
  endsAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListCyclesParams {
  teamId: string;
  type?: "current" | "previous" | "next";
}

function toCycle(row: typeof cycles.$inferSelect): Cycle {
  return {
    id: row.id,
    name: row.name,
    number: row.number,
    teamId: row.teamId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listCycles(db: AppDatabase, params: ListCyclesParams): Cycle[] {
  const now = new Date().toISOString();
  const conditions: ReturnType<typeof eq>[] = [eq(cycles.teamId, params.teamId)];

  if (params.type === "current") {
    conditions.push(isNotNull(cycles.startsAt));
    conditions.push(isNotNull(cycles.endsAt));
    conditions.push(lte(cycles.startsAt, now));
    conditions.push(gte(cycles.endsAt, now));
  } else if (params.type === "previous") {
    conditions.push(isNotNull(cycles.endsAt));
    conditions.push(lt(cycles.endsAt, now));
  } else if (params.type === "next") {
    conditions.push(isNotNull(cycles.startsAt));
    conditions.push(gt(cycles.startsAt, now));
  }

  const rows = db
    .select()
    .from(cycles)
    .where(and(...conditions))
    .all();

  return rows.map(toCycle);
}
