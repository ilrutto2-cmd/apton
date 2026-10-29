/** 데이터베이스 테이블 생성·갱신: npm run db:migrate */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL이 필요합니다.");
  const client = postgres(url, { max: 1, prepare: false });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
  console.log("✔ 데이터베이스 준비 완료");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
