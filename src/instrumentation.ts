/**
 * SCHEDULER=internal 이면 웹 서버 프로세스가 30초마다 예약 발송과 결과 확인을 직접 처리한다.
 * (브라우저를 닫아도 서버가 켜져 있는 한 예약 발송이 실행됨)
 * Vercel 같은 서버리스 환경에서는 SCHEDULER=off 로 두고 외부 크론이 /api/cron/dispatch 를 호출한다.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SCHEDULER !== "internal") return;
  const g = globalThis as unknown as { __aptonScheduler?: boolean };
  if (g.__aptonScheduler) return;
  g.__aptonScheduler = true;
  const { tick } = await import("./lib/dispatch");
  const interval = Number(process.env.WORKER_INTERVAL_MS ?? 30000);
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const r = await tick();
      if (r.claimed || r.updated || r.recovered) console.log("[scheduler]", new Date().toISOString(), r);
    } catch (e) {
      console.error("[scheduler] 오류", e);
    } finally {
      running = false;
    }
  }, interval);
  console.log(`[scheduler] 내부 예약 발송 실행기 시작 (${interval / 1000}초 간격)`);
}
