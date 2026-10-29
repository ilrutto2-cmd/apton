// 테스트 전용 데이터베이스와 키 (운영 데이터와 분리)
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://apton:apton_dev@localhost:5432/apton_test";
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.APP_URL = "https://apton.example";
delete process.env.SOLAPI_API_KEY;
delete process.env.SOLAPI_API_SECRET;
