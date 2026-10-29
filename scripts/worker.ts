/**
 * 예약 발송·결과 확인 전용 실행기 (웹 서버와 분리해 돌리고 싶을 때)
 *   npm run worker
 * 웹 서버를 SCHEDULER=internal 로 실행하면 이 프로세스는 필요 없습니다.
 */
import { tick } from "../src/lib/dispatch";

const INTERVAL = Number(process.env.WORKER_INTERVAL_MS ?? 30000);
let stopping = false;

async function loop() {
  console.log(`[worker] 시작 — ${INTERVAL / 1000}초 간격`);
  while (!stopping) {
    try {
      const r = await tick();
      if (r.claimed || r.updated || r.recovered) console.log("[worker]", new Date().toISOString(), r);
    } catch (e) {
      console.error("[worker] 오류", e);
    }
    await new Promise((res) => setTimeout(res, INTERVAL));
  }
  process.exit(0);
}
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));
loop();
