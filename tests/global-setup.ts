import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://apton:apton_dev@localhost:5432/apton_test";
  const c = postgres(url, { max: 1, onnotice: () => {} });
  await c`DROP SCHEMA IF EXISTS public CASCADE`;
  await c`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await c`CREATE SCHEMA public`;
  await migrate(drizzle(c), { migrationsFolder: "./drizzle" });
  await c.end();
}
