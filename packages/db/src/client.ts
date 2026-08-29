import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { schema } from "./schema";

export type MindPayDatabase = DrizzleD1Database<typeof schema>;

export function createMindPayDatabase(binding: D1Database): MindPayDatabase {
  return drizzle(binding, { schema });
}
