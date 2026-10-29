import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
  // prepare:false — Supabase 트랜잭션 풀러(6543)와도 호환
  return postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 5), prepare: false });
}

const g = globalThis as unknown as { __aptonSql?: ReturnType<typeof postgres> };
export const sql = g.__aptonSql ?? (g.__aptonSql = createClient());
export const db = drizzle(sql, { schema });
export type DB = typeof db;
export { schema };
