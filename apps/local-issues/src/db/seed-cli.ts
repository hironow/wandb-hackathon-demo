import { createDb } from "./client.ts";
import { seed } from "./seed.ts";

const db = createDb();
seed(db);
console.error("Seed data applied successfully.");
