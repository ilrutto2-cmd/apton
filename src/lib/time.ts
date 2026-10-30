/** 모든 화면 표시와 입력 해석은 한국 표준시(Asia/Seoul, UTC+9) 기준 */
export const TZ = "Asia/Seoul";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** "2026-11-02" + "10:00" (KST) → Date */
export function kstToDate(date: string, time = "00:00"): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00+09:00`);
  return isNaN(d.getTime()) ? null : d;
}

/** Date → { date: "YYYY-MM-DD", time: "HH:mm" } (KST) */
export function dateToKst(d: Date): { date: string; time: string } {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  const iso = k.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function kstParts(d: Date) {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    day: k.getUTCDate(),
    hour: k.getUTCHours(),
    minute: k.getUTCMinutes(),
    weekday: k.getUTCDay(),
  };
}

const WD = ["일", "월", "화", "수", "목", "금", "토"];

/** 2026년 11월 2일(월) — 문자는 오래 남으므로 연도까지 적는다 */
export function fmtDateKo(d: Date, withYear = true): string {
  const p = kstParts(d);
  return `${withYear ? `${p.year}년 ` : ""}${p.month}월 ${p.day}일(${WD[p.weekday]})`;
}

/** 오전 10시 / 오후 1시 30분 */
export function fmtTimeKo(d: Date): string {
  const p = kstParts(d);
  const ampm = p.hour < 12 ? "오전" : "오후";
  const h = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${ampm} ${h}시${p.minute ? ` ${p.minute}분` : ""}`;
}

/** 2026.11.02 10:00 */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const x = typeof d === "string" ? new Date(d) : d;
  const p = kstParts(x);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}.${pad(p.month)}.${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** 공지 일정 문구: 같은 날이면 "11월 2일(월) 오전 10시 ~ 오후 1시" */
export function fmtSchedule(start: Date | null, end: Date | null): { date: string; time: string | null } | null {
  if (!start) return null;
  if (!end) return { date: fmtDateKo(start), time: fmtTimeKo(start) + "부터" };
  const s = kstParts(start);
  const e = kstParts(end);
  const sameDay = s.year === e.year && s.month === e.month && s.day === e.day;
  if (sameDay) return { date: fmtDateKo(start), time: `${fmtTimeKo(start)} ~ ${fmtTimeKo(end)}` };
  return { date: `${fmtDateKo(start)} ${fmtTimeKo(start)} ~ ${fmtDateKo(end, s.year !== e.year)} ${fmtTimeKo(end)}`, time: null };
}

/** 이번 달 1일 0시(KST) */
export function startOfKstMonth(now = new Date()): Date {
  const p = kstParts(now);
  return new Date(Date.UTC(p.year, p.month - 1, 1) - KST_OFFSET_MS);
}

/** 오늘 0시(KST) */
export function startOfKstDay(now = new Date()): Date {
  const p = kstParts(now);
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - KST_OFFSET_MS);
}

export function todayKst(): string {
  return dateToKst(new Date()).date;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}
