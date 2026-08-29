import { readdir, readFile } from "node:fs/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const migrationsDirectory = new URL("../migrations/", import.meta.url);

export interface SignalWorksTestDatabase {
  readonly database: D1Database;
  readonly miniflare: Miniflare;
}

export async function createSignalWorksTestDatabase(
  databaseName: string,
): Promise<SignalWorksTestDatabase> {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-08-29",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: databaseName },
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } }",
    }),
  );
  const database = (await miniflare.getD1Database("DB")) as unknown as D1Database;
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  for (const migrationFile of migrationFiles) {
    const migration = await readFile(new URL(migrationFile, migrationsDirectory), "utf8");
    await database.batch(
      migration
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0)
        .map((statement) => database.prepare(statement)),
    );
  }

  return { database, miniflare };
}
