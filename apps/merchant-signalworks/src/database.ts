import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { signalWorksSchema } from "./schema";

export type SignalWorksDatabase = DrizzleD1Database<typeof signalWorksSchema>;

export function createSignalWorksDatabase(binding: D1Database): SignalWorksDatabase {
  return drizzle(binding, { schema: signalWorksSchema });
}
