import { addDays, dateToKst, kstParts } from "./time";

export type AiDraft = {
  title: string;
  body: string;
  schedule: { startDate?: string; startTime?: string; endDate?: string; endTime?: string } | null;
  warnings: string[];
};

const SYSTEM = `당신은 한국 아파트 관리사무소의 공지 문자 작성을 돕는 보조자입니다.
관리사무소 직원이 짧게 적은 메모를 입주민에게 보낼 정중하고 읽기 쉬운 안내문으로 정리합니다.

반드시 지킬 규칙:
1. 메모에 없는 사실(날짜, 시간, 장소, 동·호수, 점검 사유, 복구 예정 시각, 연락처, 업체명 등)을 절대 만들어 내지 마세요.
2. 메모의 날짜·시간 표현은 바꾸지 말고, '내일' 같은 상대 표현은 아래 제공되는 오늘 날짜로만 계산하세요.
3. 맞춤법을 바로잡고, 존댓말로, 짧은 문장으로 씁니다. 과장·광고성 표현을 쓰지 않습니다.
4. body에는 '일시:', '시간:', '대상:' 줄을 넣지 마세요(시스템이 자동으로 붙입니다). 입주민이 알아야 할 영향과 협조 요청만 1~3문장으로 씁니다.
5. 메모만으로 알 수 없는 정보는 비워 두세요.

다음 JSON 한 개만 출력하세요(설명 금지):
{"title": "공지 제목(25자 이내)", "body": "안내 문장", "schedule": {"startDate": "YYYY-MM-DD 또는 빈 문자열", "startTime": "HH:mm 또는 빈 문자열", "endDate": "YYYY-MM-DD 또는 빈 문자열", "endTime": "HH:mm 또는 빈 문자열"}}`;

/** 결과에 메모·오늘 날짜로 설명되지 않는 숫자가 있으면 경고 */
export function inventedNumbers(input: string, output: string, today: Date): string[] {
  const allowed = new Set<string>();
  const add = (n: number | string) => allowed.add(String(Number(n)));
  for (const m of input.match(/\d+/g) ?? []) add(m);
  add(kstParts(today).year);
  // 메모에 '내일' 같은 상대 표현이 있을 때만 그 날짜의 월·일을 허용
  const rel: number[] = [];
  if (input.includes("오늘") || input.includes("금일")) rel.push(0);
  if (input.includes("내일") || input.includes("명일")) rel.push(1);
  if (input.includes("모레")) rel.push(2);
  if (input.includes("글피")) rel.push(3);
  if (/다음\s*주|이번\s*주|[월화수목금토일]요일/.test(input)) for (let i = 0; i <= 13; i++) rel.push(i);
  for (const i of rel) {
    const p = kstParts(addDays(today, i));
    add(p.year);
    add(p.month);
    add(p.day);
  }
  // 오전/오후 12시간제 ↔ 24시간제 변환 허용
  for (const m of input.match(/\d+/g) ?? []) {
    const n = Number(m);
    if (n >= 1 && n <= 12) add(n + 12);
    if (n >= 13 && n <= 24) add(n - 12);
  }
  add(0);
  add(30);
  const bad = new Set<string>();
  for (const m of output.match(/\d+/g) ?? []) if (!allowed.has(String(Number(m)))) bad.add(m);
  return [...bad];
}

export async function draftNotice(input: string, categoryLabel: string, fetchImpl: typeof fetch = fetch): Promise<AiDraft> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("AI 기능이 설정되지 않았습니다.");
  const now = new Date();
  const today = dateToKst(now).date;
  const wd = ["일", "월", "화", "수", "목", "금", "토"][kstParts(now).weekday];
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "claude-haiku-5-5",
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: "user", content: `오늘 날짜: ${today}(${wd})\n공지 분류: ${categoryLabel}\n메모: ${input}` }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`AI 응답 오류(${res.status})`);
  const j = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = j.content?.find((c) => c.type === "text")?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI 응답을 해석하지 못했습니다.");
  let parsed: { title?: string; body?: string; schedule?: Record<string, string> };
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    throw new Error("AI 응답을 해석하지 못했습니다.");
  }
  const title = String(parsed.title ?? "").trim().slice(0, 60);
  const body = String(parsed.body ?? "").trim().slice(0, 600);
  const sch = parsed.schedule ?? {};
  const clean = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v) ? v : undefined);
  const schedule = {
    startDate: clean(sch.startDate, /^\d{4}-\d{2}-\d{2}$/),
    startTime: clean(sch.startTime, /^\d{2}:\d{2}$/),
    endDate: clean(sch.endDate, /^\d{4}-\d{2}-\d{2}$/),
    endTime: clean(sch.endTime, /^\d{2}:\d{2}$/),
  };
  const warnings: string[] = [];
  const invented = inventedNumbers(input, `${title}\n${body}\n${Object.values(schedule).join(" ")}`, now);
  if (invented.length) warnings.push(`메모에 없던 숫자(${invented.join(", ")})가 들어 있습니다. 사실과 맞는지 꼭 확인하세요.`);
  return { title, body, schedule: schedule.startDate ? schedule : null, warnings };
}
