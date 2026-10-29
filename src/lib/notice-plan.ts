import { z } from "zod";
import { addDays, dateToKst, kstToDate } from "./time";

export const noticeInputSchema = z.object({
  requestKey: z.string().min(8).max(80),
  noticeId: z.string().uuid().optional(),
  category: z.string().min(1).max(30),
  title: z.string().trim().min(1, "공지 제목을 입력해 주세요.").max(100, "제목은 100자 이내로 입력해 주세요."),
  body: z.string().max(1500),
  startDate: z.string().optional().default(""),
  startTime: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  endTime: z.string().optional().default(""),
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("all") }),
    z.object({ type: z.literal("buildings"), buildingIds: z.array(z.string().uuid()).max(500) }),
    z.object({ type: z.literal("units"), unitIds: z.array(z.string().uuid()).max(5000) }),
  ]),
  visibility: z.enum(["public", "private"]),
  includeLink: z.boolean(),
  isEmergency: z.boolean(),
  smsText: z.string().max(4000),
  smsTextEdited: z.boolean(),
  method: z.enum(["now", "schedule", "draft"]),
  scheduleDate: z.string().optional().default(""),
  scheduleTime: z.string().optional().default(""),
  reminders: z.array(z.enum(["d3", "d1", "d0"])).default([]),
  extraTimes: z.array(z.object({ date: z.string(), time: z.string() })).max(10).default([]),
});
export type NoticeInput = z.infer<typeof noticeInputSchema>;

import { REMINDER_LABELS } from "./reminders";
export { REMINDER_LABELS };

export type PlannedSend = { at: Date; kind: "immediate" | "scheduled" | "reminder"; label: string };

export function parseSchedule(i: Pick<NoticeInput, "startDate" | "startTime" | "endDate" | "endTime">) {
  const startsAt = i.startDate ? kstToDate(i.startDate, i.startTime || "00:00") : null;
  const endsAt = i.endDate || i.endTime ? kstToDate(i.endDate || i.startDate, i.endTime || "23:59") : null;
  return { startsAt, endsAt };
}

/**
 * 발송 회차 계획. 과거 시각은 제외하고 이유를 알려준다.
 * 오류가 있으면 error 문자열.
 */
export function planSends(i: NoticeInput, startsAt: Date | null, now = new Date()): { sends: PlannedSend[]; skipped: string[]; error?: string } {
  const sends: PlannedSend[] = [];
  const skipped: string[] = [];
  if (i.method === "draft") return { sends, skipped };
  if (i.method === "now") sends.push({ at: now, kind: "immediate", label: "즉시 발송" });
  if (i.method === "schedule") {
    const at = kstToDate(i.scheduleDate, i.scheduleTime);
    if (!at) return { sends, skipped, error: "예약 발송 날짜와 시간을 입력해 주세요." };
    if (at.getTime() < now.getTime() + 60_000) return { sends, skipped, error: "예약 시각은 지금으로부터 1분 이후여야 합니다." };
    sends.push({ at, kind: "scheduled", label: "예약 발송" });
  }
  if (i.reminders.length) {
    if (!startsAt) return { sends, skipped, error: "재안내를 예약하려면 공지 일정(시작 날짜)을 입력해 주세요." };
    const day = dateToKst(startsAt).date;
    const base = kstToDate(day, "00:00")!;
    for (const r of i.reminders) {
      const at = r === "d3" ? kstToDate(dateToKst(addDays(base, -3)).date, "09:00")! : r === "d1" ? kstToDate(dateToKst(addDays(base, -1)).date, "09:00")! : kstToDate(day, "08:00")!;
      if (at.getTime() <= now.getTime() + 60_000) skipped.push(`${REMINDER_LABELS[r]}(이미 지난 시각)`);
      else sends.push({ at, kind: "reminder", label: REMINDER_LABELS[r] });
    }
  }
  for (const t of i.extraTimes) {
    if (!t.date || !t.time) continue;
    const at = kstToDate(t.date, t.time);
    if (!at) return { sends, skipped, error: "추가 발송 시각 형식이 올바르지 않습니다." };
    if (at.getTime() <= now.getTime() + 60_000) skipped.push(`${t.date} ${t.time}(이미 지난 시각)`);
    else sends.push({ at, kind: "reminder", label: "직접 지정한 시각" });
  }
  sends.sort((a, b) => a.at.getTime() - b.at.getTime());
  // 같은 시각(분 단위) 중복 제거
  const uniq: PlannedSend[] = [];
  for (const s of sends) if (!uniq.some((u) => Math.abs(u.at.getTime() - s.at.getTime()) < 60_000)) uniq.push(s);
  if (uniq.length > 6) return { sends: uniq, skipped, error: "한 공지의 발송 횟수는 6회까지입니다." };
  return { sends: uniq, skipped };
}

/** 첫 회차 이후의 발송에는 '(재안내)' 표시를 붙인다 */
export function prefixFor(index: number): string {
  return index === 0 ? "" : "(재안내)";
}
