"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui";
import { buildShortSms, buildSmsText, CATEGORIES, categoryOf } from "@/lib/notice-templates";
import { smsBytes } from "@/lib/sms/message";
import { REMINDER_LABELS } from "@/lib/reminders";
import { kstToDate, todayKst, fmtDateTime } from "@/lib/time";
import { previewAction, submitNoticeAction, type Preview } from "../actions";
import type { NoticeTarget } from "@/db/schema";

type B = { id: string; name: string };
type U = { id: string; buildingId: string; unitNo: string; floor: number | null };

export type ComposeInitial = {
  noticeId?: string;
  category: string;
  title: string;
  body: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  target: NoticeTarget;
  visibility: "public" | "private";
  includeLink: boolean;
  excludeAppUsers: boolean;
  isEmergency: boolean;
  smsText: string;
  smsTextEdited: boolean;
  method: "now" | "schedule";
  scheduleDate: string;
  scheduleTime: string;
};

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shortDate(date: string): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

function won(n: number) {
  return `${Math.round(n * 10) / 10 >= 1000 ? Math.round(n).toLocaleString("ko-KR") : (Math.round(n * 10) / 10).toLocaleString("ko-KR")}원`;
}

export function ComposeForm({
  apt,
  buildings,
  units,
  initial,
  emergency,
  aiEnabled,
  liveReady,
}: {
  apt: { name: string; officePhone: string; mode: "test" | "live"; includeLinkDefault: boolean };
  buildings: B[];
  units: U[];
  initial?: ComposeInitial;
  emergency: boolean;
  aiEnabled: boolean;
  liveReady: boolean;
}) {
  const router = useRouter();
  const [requestKey] = useState(newKey);
  const startCat = initial?.category ?? (emergency ? "emergency" : "elevator");
  const [category, setCategory] = useState(startCat);
  const [title, setTitle] = useState(initial?.title ?? categoryOf(startCat).title);
  const [titleTouched, setTitleTouched] = useState(!!initial);
  const [body, setBody] = useState(initial?.body ?? categoryOf(startCat).body);
  const [bodyTouched, setBodyTouched] = useState(!!initial);
  const [startDate, setStartDate] = useState(initial?.startDate ?? (emergency ? "" : ""));
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "");
  const [target, setTarget] = useState<NoticeTarget>(initial?.target ?? { type: "all" });
  const [visibility, setVisibility] = useState<"public" | "private">(initial?.visibility ?? "public");
  const [includeLink, setIncludeLink] = useState(initial?.includeLink ?? apt.includeLinkDefault);
  const [excludeAppUsers, setExcludeAppUsers] = useState(initial?.excludeAppUsers ?? false);
  const [shortErr, setShortErr] = useState<string | null>(null);
  const isEmergency = category === "emergency";
  const [smsEdited, setSmsEdited] = useState(initial?.smsTextEdited ?? false);
  const [smsManual, setSmsManual] = useState(initial?.smsText ?? "");
  const [method, setMethod] = useState<"now" | "schedule">(initial?.method ?? "now");
  const [scheduleDate, setScheduleDate] = useState(initial?.scheduleDate ?? "");
  const [scheduleTime, setScheduleTime] = useState(initial?.scheduleTime ?? "09:00");
  const [reminders, setReminders] = useState<string[]>([]);
  const [extraTimes, setExtraTimes] = useState<{ date: string; time: string }[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 대상 문구(문자 '대상:' 줄) — 서버와 같은 규칙
  const targetText = useMemo(() => {
    if (target.type === "all") return "전체 세대";
    if (target.type === "buildings") {
      const names = buildings.filter((b) => target.buildingIds.includes(b.id)).map((b) => b.name);
      return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}개 동`;
    }
    const labels = units
      .filter((u) => target.unitIds.includes(u.id))
      .map((u) => ({ b: buildings.find((b) => b.id === u.buildingId), u }))
      .sort((a, b) => buildings.indexOf(a.b!) - buildings.indexOf(b.b!) || a.u.unitNo.localeCompare(b.u.unitNo, "ko", { numeric: true }))
      .map((x) => `${x.b?.name} ${x.u.unitNo}호`);
    return labels.length <= 2 ? labels.join(", ") : `${labels[0]} 외 ${labels.length - 1}세대`;
  }, [target, buildings, units]);

  const startsAt = startDate ? kstToDate(startDate, startTime || "00:00") : null;
  const endsAt = endDate || endTime ? kstToDate(endDate || startDate, endTime || "23:59") : null;
  const autoText = buildSmsText({
    apartmentName: apt.name,
    officePhone: apt.officePhone,
    isEmergency,
    title,
    body,
    startsAt,
    endsAt,
    targetLabel: targetText,
  });
  const smsText = smsEdited ? smsManual : autoText;

  // 분류를 바꾸면, 직접 고치지 않은 제목·안내문은 새 분류의 기본 문구로
  function pickCategory(id: string) {
    const c = categoryOf(id);
    setCategory(id);
    if (!titleTouched) setTitle(startDate ? `${shortDate(startDate)} ${c.title}` : c.title);
    if (!bodyTouched) setBody(c.body);
    if (id === "emergency") setMethod("now");
  }
  function changeStartDate(v: string) {
    setStartDate(v);
    if (!titleTouched) setTitle(v ? `${shortDate(v)} ${categoryOf(category).title}` : categoryOf(category).title);
    if (endDate && v && endDate < v) setEndDate(v);
  }

  const input = {
    requestKey,
    noticeId: initial?.noticeId,
    category,
    title,
    body,
    startDate,
    startTime,
    endDate,
    endTime,
    target,
    visibility,
    includeLink,
    excludeAppUsers,
    isEmergency,
    smsText,
    smsTextEdited: smsEdited,
    method,
    scheduleDate,
    scheduleTime,
    reminders,
    extraTimes,
  };
  const inputKey = JSON.stringify({ ...input, requestKey: undefined });

  // 받는 사람·비용 미리보기(입력이 멈추면 서버에 계산 요청)
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await previewAction({ ...JSON.parse(inputKey), requestKey });
        if (my !== seq.current) return;
        if ("targetLabel" in r) {
          setPreview(r);
          setPreviewErr(null);
        } else setPreviewErr(r.error);
      } catch {
        if (my === seq.current) setPreviewErr("미리보기를 계산하지 못했습니다.");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [inputKey, requestKey]);

  const noTarget = (target.type === "buildings" && !target.buildingIds.length) || (target.type === "units" && !target.unitIds.length);

  async function submit(m: "now" | "schedule" | "draft") {
    setBusy(true);
    setError(null);
    try {
      const r = await submitNoticeAction({ ...input, method: m });
      if (r.error) {
        setError(r.error);
        setConfirming(false);
        return;
      }
      if (m === "draft") {
        setNotice("임시 저장했습니다. 공지 내역에서 이어서 작성할 수 있습니다.");
        router.push(`/notices/${r.noticeId}?saved=draft`);
        return;
      }
      router.push(`/notices/${r.noticeId}?created=${m}`);
    } catch (e) {
      setError(`요청을 처리하지 못했습니다. 공지 내역에서 발송 여부를 먼저 확인한 뒤 다시 시도해 주세요. (${(e as Error).message})`);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  function openConfirm() {
    setError(null);
    if (!title.trim()) return setError("공지 제목을 입력해 주세요.");
    if (noTarget) return setError("발송 대상을 선택해 주세요.");
    if (method === "schedule" && (!scheduleDate || !scheduleTime)) return setError("예약 발송 날짜와 시간을 입력해 주세요.");
    if (preview?.error) return setError(preview.error);
    if (!preview || preview.recipients === 0) return setError("문자를 받을 수 있는 수신자가 없습니다. 연락처와 수신 동의 상태를 확인하세요.");
    if (preview.overLimit) return setError("문자가 너무 깁니다. 내용을 줄여 주세요.");
    if (apt.mode === "live" && !liveReady) return setError("실제 발송 설정(API 키·발신번호)이 완료되지 않았습니다. 설정 화면을 확인하세요.");
    setConfirming(true);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        {error && <Alert>{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}

        {/* ① 공지 유형 */}
        <Section n={1} title="어떤 공지인가요?">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pickCategory(c.id)}
                aria-pressed={category === c.id}
                className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center text-[0.92rem] font-semibold transition ${
                  category === c.id
                    ? c.id === "emergency"
                      ? "border-red-500 bg-red-50 text-red-700 ring-2 ring-red-100"
                      : "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-100"
                    : "border-line bg-white hover:bg-slate-50"
                }`}
              >
                <span className="text-2xl" aria-hidden>{c.icon}</span>
                {c.label}
              </button>
            ))}
          </div>
        </Section>

        {aiEnabled && (
          <AiAssist
            category={category}
            onApply={(t, b, sch) => {
              setTitle(t);
              setTitleTouched(true);
              setBody(b);
              setBodyTouched(true);
              setSmsEdited(false);
              if (sch?.startDate) {
                setStartDate(sch.startDate);
                setStartTime(sch.startTime ?? "");
                setEndDate(sch.endDate || (sch.endTime ? sch.startDate : ""));
                setEndTime(sch.endTime ?? "");
              }
            }}
          />
        )}

        {/* ② 제목 ③ 내용 */}
        <Section n={2} title="제목과 안내 내용">
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="title">공지 제목</label>
              <input id="title" className="input" value={title} maxLength={100} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} />
            </div>
            <div>
              <label className="label" htmlFor="body">안내 내용</label>
              <textarea id="body" rows={4} className="input" value={body} onChange={(e) => { setBody(e.target.value); setBodyTouched(true); }} placeholder="입주민에게 알릴 내용을 적어 주세요." />
              <p className="hint">날짜·시간·대상은 아래 입력값으로 문자에 자동으로 들어갑니다.</p>
            </div>
          </div>
        </Section>

        {/* ④ 일정 */}
        <Section n={3} title="일정 (선택)" desc="점검·단수처럼 정해진 시간이 있으면 입력하세요. 긴급 공지는 비워 두어도 됩니다.">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <label className="label" htmlFor="sd">시작 날짜</label>
              <input id="sd" type="date" className="input" value={startDate} min={initial ? undefined : todayKst()} onChange={(e) => changeStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="st">시작 시간</label>
              <input id="st" type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={!startDate} />
            </div>
            <div>
              <label className="label" htmlFor="ed">종료 날짜</label>
              <input id="ed" type="date" className="input" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} disabled={!startDate} />
            </div>
            <div>
              <label className="label" htmlFor="et">종료 시간</label>
              <input id="et" type="time" className="input" value={endTime} onChange={(e) => { setEndTime(e.target.value); if (!endDate) setEndDate(startDate); }} disabled={!startDate} />
            </div>
          </div>
          {startDate && (
            <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => { changeStartDate(""); setStartTime(""); setEndDate(""); setEndTime(""); setReminders([]); }}>
              일정 지우기
            </button>
          )}
        </Section>

        {/* ⑤ 대상 */}
        <Section n={4} title="누구에게 보낼까요?">
          <TargetPicker buildings={buildings} units={units} target={target} setTarget={setTarget} />
          {!isEmergency ? (
            <label className="mt-3 flex items-start gap-3 rounded-xl bg-slate-50 p-3">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-brand-500" checked={excludeAppUsers} onChange={(e) => setExcludeAppUsers(e.target.checked)} />
              <span>
                <b>다른 아파트 앱 사용 세대는 빼고 보내기</b>
                <span className="block text-sm text-sub">입주민 연락처에서 &lsquo;다른 앱 사용&rsquo;으로 표시한 세대에는 문자를 보내지 않아 요금을 줄입니다.</span>
              </span>
            </label>
          ) : (
            <p className="hint mt-3">긴급 공지는 다른 앱 사용 세대를 포함해 모든 대상에게 보냅니다.</p>
          )}
        </Section>

        {/* 문자 내용 확인 */}
        <Section n={5} title="보낼 문자 확인" desc="위 내용으로 자동 작성됩니다. 필요하면 직접 고칠 수 있어요.">
          <div className="space-y-3">
            <textarea
              aria-label="보낼 문자 내용"
              rows={12}
              className="input font-[inherit] text-[0.98rem]"
              value={smsText}
              onChange={(e) => { setSmsManual(e.target.value); setSmsEdited(true); }}
            />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {smsEdited ? (
                <>
                  <span className="badge bg-amber-100 text-amber-800">직접 수정함 — 위 입력을 바꿔도 자동으로 바뀌지 않음</span>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setSmsEdited(false)}>자동 작성으로 되돌리기</button>
                </>
              ) : (
                <span className="badge bg-brand-50 text-brand-700">자동 작성 중</span>
              )}
              {smsBytes(smsText) > 90 && !includeLink && (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    const short = buildShortSms(
                      { apartmentName: apt.name, officePhone: apt.officePhone, isEmergency, title, body, startsAt, endsAt, targetLabel: targetText, categoryTitle: categoryOf(category).title },
                      90,
                      smsBytes,
                    );
                    if (short) {
                      setSmsManual(short);
                      setSmsEdited(true);
                      setShortErr(null);
                    } else setShortErr("내용이 길어 단문(90바이트)으로 줄일 수 없습니다. 장문으로 보내거나 직접 줄여 주세요.");
                  }}
                >
                  ✂ 단문으로 줄이기 (요금 약 60% 절약)
                </button>
              )}
              {shortErr && <span className="text-sm text-red-700">{shortErr}</span>}
            </div>
            <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-brand-500" checked={includeLink} onChange={(e) => setIncludeLink(e.target.checked)} />
              <span>
                <b>공지 확인 링크 넣기</b>
                <span className="block text-sm text-sub">문자 끝에 상세 내용·이전 공지를 볼 수 있는 링크를 붙입니다. 문자 사기(스미싱) 걱정으로 링크를 누르지 않는 분이 많으니, 필요한 내용은 문자 본문에 모두 적고 링크는 꼭 필요할 때만 넣으세요. 링크를 넣으면 대부분 장문(LMS)이 됩니다.</span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="공개 범위">
              <button type="button" role="radio" aria-checked={visibility === "public"} className={`chip ${visibility === "public" ? "chip-on" : ""}`} onClick={() => setVisibility("public")}>
                🏢 단지 공지 — 입주민 공지 페이지에 공개
              </button>
              <button type="button" role="radio" aria-checked={visibility === "private"} className={`chip ${visibility === "private" ? "chip-on" : ""}`} onClick={() => setVisibility("private")}>
                🔒 세대별 안내 — 받은 사람만 링크로 열람
              </button>
            </div>
            {visibility === "private" && <p className="hint">개별 세대 안내(방문 점검, 누수 등)는 공개 페이지에 올라가지 않고, 문자를 받은 사람의 개인 링크로만 볼 수 있습니다.</p>}
            {preview && preview.adWords.length > 0 && (
              <Alert kind="warn">
                광고성으로 보일 수 있는 표현이 있습니다: <b>{preview.adWords.join(", ")}</b>. 아파트온은 관리 목적의 정보성 안내만 보낼 수 있습니다. 광고·홍보 문자는 정보통신망법에 따라 별도 동의와 (광고) 표기 등이 필요합니다.
              </Alert>
            )}
          </div>
        </Section>

        {/* ⑥ 발송 방법 */}
        <Section n={6} title="언제 보낼까요?">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="발송 방법">
            <button type="button" role="radio" aria-checked={method === "now"} className={`chip ${method === "now" ? "chip-on" : ""}`} onClick={() => setMethod("now")}>⚡ 지금 바로</button>
            <button type="button" role="radio" aria-checked={method === "schedule"} className={`chip ${method === "schedule" ? "chip-on" : ""}`} onClick={() => setMethod("schedule")} disabled={isEmergency}>⏰ 예약 발송</button>
          </div>
          {method === "schedule" && (
            <div className="mt-3 grid grid-cols-2 gap-3 md:max-w-md">
              <div>
                <label className="label" htmlFor="sch-d">발송 날짜</label>
                <input id="sch-d" type="date" className="input" min={todayKst()} value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="sch-t">발송 시간</label>
                <input id="sch-t" type="time" className="input" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
              </div>
            </div>
          )}
          {!isEmergency && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <div className="font-semibold">다시 알림(재안내)</div>
              {!startDate ? (
                <p className="hint">일정(시작 날짜)을 입력하면 3일 전·1일 전·당일 아침 재안내를 예약할 수 있습니다.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["d3", "d1", "d0"] as const).map((r) => (
                    <label key={r} className={`chip ${reminders.includes(r) ? "chip-on" : ""}`}>
                      <input type="checkbox" className="sr-only" checked={reminders.includes(r)} onChange={(e) => setReminders(e.target.checked ? [...reminders, r] : reminders.filter((x) => x !== r))} />
                      {reminders.includes(r) ? "✓ " : ""}
                      {REMINDER_LABELS[r]}
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-3 space-y-2">
                {extraTimes.map((t, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    <input type="date" aria-label="추가 발송 날짜" className="input w-44" min={todayKst()} value={t.date} onChange={(e) => setExtraTimes(extraTimes.map((x, i) => (i === idx ? { ...x, date: e.target.value } : x)))} />
                    <input type="time" aria-label="추가 발송 시간" className="input w-36" value={t.time} onChange={(e) => setExtraTimes(extraTimes.map((x, i) => (i === idx ? { ...x, time: e.target.value } : x)))} />
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setExtraTimes(extraTimes.filter((_, i) => i !== idx))}>삭제</button>
                  </div>
                ))}
                {extraTimes.length < 4 && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setExtraTimes([...extraTimes, { date: startDate || todayKst(), time: "09:00" }])}>
                    ＋ 원하는 날짜·시간에 한 번 더 보내기
                  </button>
                )}
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* 오른쪽: 문자 미리보기와 요약 */}
      <aside className="lg:sticky lg:top-32 lg:self-start">
        <div className="space-y-4">
          <PhonePreview text={preview?.sampleText ?? smsText} type={preview?.type} bytes={preview?.bytes} emergency={isEmergency} />
          <SummaryCard preview={preview} error={previewErr} mode={apt.mode} />
          <div className="hidden gap-2 lg:flex lg:flex-col">
            <ActionButtons busy={busy} method={method} emergency={isEmergency} onConfirm={openConfirm} onDraft={() => submit("draft")} />
          </div>
        </div>
      </aside>

      {/* 모바일 하단 고정 버튼 */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl gap-2">
          <ActionButtons busy={busy} method={method} emergency={isEmergency} onConfirm={openConfirm} onDraft={() => submit("draft")} compact />
        </div>
      </div>

      {confirming && preview && (
        <ConfirmDialog
          preview={preview}
          title={title}
          method={method}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onSend={() => submit(method)}
        />
      )}
    </div>
  );
}

function Section({ n, title, desc, children }: { n: number; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-500 text-sm text-white">{n}</span>
        {title}
      </h2>
      {desc && <p className="mb-3 text-sm text-sub">{desc}</p>}
      <div className={desc ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function TargetPicker({ buildings, units, target, setTarget }: { buildings: B[]; units: U[]; target: NoticeTarget; setTarget: (t: NoticeTarget) => void }) {
  const [bView, setBView] = useState(buildings[0]?.id ?? "");
  const mode = target.type;
  const selectedUnits = target.type === "units" ? target.unitIds : [];
  const selectedBuildings = target.type === "buildings" ? target.buildingIds : [];
  const unitsInView = units.filter((u) => u.buildingId === bView);
  const floors = [...new Set(unitsInView.map((u) => u.floor ?? 0))].sort((a, b) => b - a);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="대상 범위">
        <button type="button" role="radio" aria-checked={mode === "all"} className={`chip ${mode === "all" ? "chip-on" : ""}`} onClick={() => setTarget({ type: "all" })}>전체 세대</button>
        <button type="button" role="radio" aria-checked={mode === "buildings"} className={`chip ${mode === "buildings" ? "chip-on" : ""}`} onClick={() => setTarget({ type: "buildings", buildingIds: [] })}>동 선택</button>
        <button type="button" role="radio" aria-checked={mode === "units"} className={`chip ${mode === "units" ? "chip-on" : ""}`} onClick={() => setTarget({ type: "units", unitIds: [] })}>호수(세대) 선택</button>
      </div>
      {mode === "buildings" && (
        <div>
          <p className="mb-2 text-sm text-sub">보낼 동을 누르세요. 여러 동을 함께 고를 수 있습니다.</p>
          <div className="flex flex-wrap gap-2">
            {buildings.map((b) => {
              const on = selectedBuildings.includes(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={on}
                  className={`chip min-w-24 justify-center text-base ${on ? "chip-on" : ""}`}
                  onClick={() => setTarget({ type: "buildings", buildingIds: on ? selectedBuildings.filter((x) => x !== b.id) : [...selectedBuildings, b.id] })}
                >
                  {on ? "✓ " : ""}
                  {b.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {mode === "units" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-40" value={bView} onChange={(e) => setBView(e.target.value)} aria-label="동 보기">
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                const ids = unitsInView.map((u) => u.id);
                const all = ids.every((id) => selectedUnits.includes(id));
                setTarget({ type: "units", unitIds: all ? selectedUnits.filter((x) => !ids.includes(x)) : [...new Set([...selectedUnits, ...ids])] });
              }}
            >
              이 동 전체 선택/해제
            </button>
            <span className="text-sm font-semibold text-brand-700">선택 {selectedUnits.length}세대</span>
            {selectedUnits.length > 0 && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setTarget({ type: "units", unitIds: [] })}>모두 해제</button>
            )}
          </div>
          <div className="max-h-72 space-y-1 overflow-auto rounded-xl border border-line p-2">
            {floors.map((f) => (
              <div key={f} className="flex items-start gap-2">
                <span className="w-10 shrink-0 pt-1.5 text-right text-xs font-semibold text-sub">{f ? `${f}층` : ""}</span>
                <div className="flex flex-wrap gap-1">
                  {unitsInView
                    .filter((u) => (u.floor ?? 0) === f)
                    .map((u) => {
                      const on = selectedUnits.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setTarget({ type: "units", unitIds: on ? selectedUnits.filter((x) => x !== u.id) : [...selectedUnits, u.id] })}
                          className={`min-h-9 min-w-14 rounded-lg border px-2 text-sm font-medium ${on ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white hover:bg-brand-50"}`}
                        >
                          {u.unitNo}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PhonePreview({ text, type, bytes, emergency }: { text: string; type?: string; bytes?: number; emergency: boolean }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-slate-50 px-4 py-2 text-sm">
        <span className="font-semibold">📱 받는 사람 화면</span>
        {type && (
          <span className={`badge ${type === "SMS" ? "bg-emerald-50 text-emerald-700" : "bg-brand-50 text-brand-700"}`}>
            {type === "SMS" ? "단문(SMS)" : "장문(LMS)"} · {bytes}바이트
          </span>
        )}
      </div>
      <div className="max-h-[22rem] overflow-auto bg-[#eef2f7] p-4">
        <div className={`ml-auto mr-0 max-w-[92%] rounded-2xl rounded-tl-sm bg-white p-3.5 text-[0.95rem] leading-relaxed whitespace-pre-wrap shadow-sm ${emergency ? "border-l-4 border-red-500" : ""}`} style={{ marginLeft: 0 }}>
          {text || <span className="text-slate-400">문자 내용이 여기에 표시됩니다.</span>}
        </div>
      </div>
      <p className="px-4 py-2 text-xs text-sub">단문(SMS)은 90바이트(한글 약 45자)까지, 넘으면 장문(LMS)으로 보냅니다.</p>
    </div>
  );
}

function SummaryCard({ preview, error, mode }: { preview: Preview | null; error: string | null; mode: "test" | "live" }) {
  if (error) return <Alert>{error}</Alert>;
  if (!preview) return <div className="card p-4 text-sub">받는 사람을 계산하고 있습니다…</div>;
  const ex = preview.excludedNoConsent + preview.excludedInactive + preview.excludedSample + preview.excludedAppUsers;
  return (
    <div className="card space-y-2 p-4 text-[0.95rem]">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold text-sub">받는 사람</span>
        <span>
          <b className="text-2xl text-brand-700" data-testid="recipient-count">{preview.recipients.toLocaleString()}</b>명
          <span className="text-sub"> · {preview.units}세대</span>
        </span>
      </div>
      <div className="text-sm text-sub">대상: {preview.targetLabel || "선택 안 됨"}</div>
      {(ex > 0 || preview.duplicatesMerged > 0) && (
        <ul className="rounded-lg bg-slate-50 p-2 text-sm text-sub">
          {preview.excludedNoConsent > 0 && <li>· 수신 동의 미확인·거부 {preview.excludedNoConsent}명 제외</li>}
          {preview.excludedInactive > 0 && <li>· 전출 등 비활성 {preview.excludedInactive}명 제외</li>}
          {preview.excludedSample > 0 && <li>· 샘플 연락처 {preview.excludedSample}명 제외(실제 발송)</li>}
          {preview.excludedAppUsers > 0 && <li>· 다른 앱 사용 {preview.excludedAppUsers}명 제외</li>}
          {preview.duplicatesMerged > 0 && <li>· 같은 번호 {preview.duplicatesMerged}건은 한 번만 발송</li>}
        </ul>
      )}
      <div className="flex items-baseline justify-between border-t border-line pt-2">
        <span className="font-semibold text-sub">예상 비용</span>
        <span className="text-right">
          {mode === "test" ? (
            <span className="font-bold text-amber-700">테스트 모드 · 0원</span>
          ) : (
            <>
              <b className="text-lg">{won(preview.totalCost)}</b> <span className="text-xs text-sub">VAT 별도</span>
            </>
          )}
        </span>
      </div>
      <div className="text-xs text-sub">
        {preview.type} 건당 {won(preview.rate)} × {preview.recipients}명{preview.sends.length > 1 ? ` × ${preview.sends.length}회` : ""}
        {mode === "test" ? " (실제 발송 시 기준)" : ""}
      </div>
      {preview.sends.length > 0 && (
        <div className="border-t border-line pt-2 text-sm">
          <div className="font-semibold text-sub">발송 일정</div>
          <ul>
            {preview.sends.map((s, i) => (
              <li key={i}>· {s.label === "즉시 발송" ? "지금 바로" : `${fmtDateTime(s.at)} (${s.label})`}</li>
            ))}
          </ul>
          {preview.skipped.length > 0 && <p className="text-xs text-amber-700">건너뜀: {preview.skipped.join(", ")}</p>}
        </div>
      )}
      {preview.error && <p className="text-sm text-red-600">{preview.error}</p>}
    </div>
  );
}

function ActionButtons({ busy, method, emergency, onConfirm, onDraft, compact }: { busy: boolean; method: string; emergency: boolean; onConfirm: () => void; onDraft: () => void; compact?: boolean }) {
  return (
    <>
      <button type="button" className={`${emergency ? "btn-danger" : "btn-primary"} ${compact ? "flex-1" : "w-full"} text-lg`} disabled={busy} onClick={onConfirm}>
        {method === "schedule" ? "예약 내용 확인" : "발송 내용 확인"}
      </button>
      <button type="button" className={`btn-secondary ${compact ? "" : "w-full"}`} disabled={busy} onClick={onDraft}>
        임시 저장
      </button>
    </>
  );
}

function ConfirmDialog({ preview, title, method, busy, onCancel, onSend }: { preview: Preview; title: string; method: string; busy: boolean; onCancel: () => void; onSend: () => void }) {
  const live = preview.mode === "live";
  const [checked, setChecked] = useState(!live);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <h2 id="confirm-title" className="text-xl font-bold">{method === "schedule" ? "이대로 예약할까요?" : "이대로 보낼까요?"}</h2>
        <div className={`mt-3 rounded-xl px-4 py-2 text-[0.95rem] font-semibold ${live ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
          {live ? "● 실제 발송 — 입주민 휴대전화로 문자가 전송되고 요금이 청구됩니다." : "🧪 테스트 모드 — 실제 문자는 나가지 않고 요금도 0원입니다."}
        </div>
        <dl className="mt-4 grid grid-cols-[6.5rem_1fr] gap-y-2 text-[0.98rem]">
          <dt className="text-sub">공지</dt>
          <dd className="font-semibold">{title}</dd>
          <dt className="text-sub">대상</dt>
          <dd className="font-semibold">{preview.targetLabel}</dd>
          <dt className="text-sub">받는 사람</dt>
          <dd><b className="text-brand-700">{preview.recipients.toLocaleString()}명</b> ({preview.units}세대)</dd>
          <dt className="text-sub">문자 종류</dt>
          <dd>{preview.type === "SMS" ? "단문(SMS)" : "장문(LMS)"} · {preview.bytes}바이트</dd>
          <dt className="text-sub">발송</dt>
          <dd>
            {preview.sends.map((s, i) => (
              <div key={i}>{s.label === "즉시 발송" ? "지금 바로" : `${fmtDateTime(s.at)} · ${s.label}`}</div>
            ))}
          </dd>
          <dt className="text-sub">예상 비용</dt>
          <dd>
            {live ? (
              <>
                <b>{won(preview.totalCost)}</b> (VAT 별도) · VAT 포함 약 {won(preview.totalCost * 1.1)}
              </>
            ) : (
              <>0원 (실제 발송이라면 약 {won(preview.totalCost)}, VAT 별도)</>
            )}
          </dd>
          {live && (
            <>
              <dt className="text-sub">발신번호</dt>
              <dd>{preview.senderNumber}</dd>
            </>
          )}
        </dl>
        <details className="mt-3 rounded-xl bg-slate-50 p-3" open>
          <summary className="cursor-pointer font-semibold">문자 내용</summary>
          <pre className="mt-2 font-[inherit] text-[0.92rem] whitespace-pre-wrap">{preview.sampleText}</pre>
        </details>
        {live && (
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 p-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-red-600" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>위 내용과 받는 사람 {preview.recipients.toLocaleString()}명, 예상 비용을 확인했습니다.</span>
          </label>
        )}
        <div className="mt-5 flex gap-2">
          <button ref={cancelRef} type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={busy}>돌아가서 고치기</button>
          <button type="button" className="btn-primary flex-[1.4] text-lg" onClick={onSend} disabled={busy || !checked}>
            {busy ? "처리 중…" : method === "schedule" ? "예약하기" : live ? "발송하기" : "테스트 발송하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

type AiSchedule = { startDate?: string; startTime?: string; endDate?: string; endTime?: string } | null;

function AiAssist({ category, onApply }: { category: string; onApply: (title: string, body: string, schedule: AiSchedule) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ title: string; body: string; schedule: AiSchedule; warnings: string[] } | null>(null);
  const [useSchedule, setUseSchedule] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: text, category }) });
      const j = await res.json();
      if (!res.ok) setErr(j.error ?? "AI 작성에 실패했습니다.");
      else setResult(j);
    } catch {
      setErr("AI 작성에 실패했습니다. 직접 작성해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card border-violet-200 bg-violet-50/40 p-5">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-lg font-bold">✨ 간단히 적으면 AI가 공지문으로 다듬어 드려요</span>
        <span className="text-sub">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 내일 101동 엘리베이터 오전 10시부터 오후 12시까지 점검" />
          <button type="button" className="btn-secondary" disabled={busy || text.trim().length < 4} onClick={run}>{busy ? "작성 중…" : "공지문 초안 만들기"}</button>
          {err && <Alert>{err}</Alert>}
          {result && (
            <div className="space-y-2 rounded-xl border border-violet-200 bg-white p-4">
              <div className="font-bold">{result.title}</div>
              <div className="whitespace-pre-wrap text-[0.95rem]">{result.body}</div>
              {result.schedule?.startDate && (
                <label className="flex items-center gap-2 text-[0.95rem]">
                  <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={useSchedule} onChange={(e) => setUseSchedule(e.target.checked)} />
                  AI가 읽은 일정도 넣기: <b>{result.schedule.startDate} {result.schedule.startTime ?? ""}{result.schedule.endTime ? ` ~ ${result.schedule.endTime}` : ""}</b>
                </label>
              )}
              {result.warnings.length > 0 && <Alert kind="warn">{result.warnings.join(" ")}</Alert>}
              <p className="text-sm text-sub">AI 초안입니다. 발송 대상은 직접 선택하고, 날짜·시간·내용이 맞는지 꼭 확인해 주세요.</p>
              <button type="button" className="btn-primary btn-sm" onClick={() => onApply(result.title, result.body, useSchedule ? result.schedule : null)}>이 초안 사용하기</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
