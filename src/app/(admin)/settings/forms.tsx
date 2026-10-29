"use client";

import { useActionState, useState, useTransition } from "react";
import { ActionForm, Alert, SubmitButton } from "@/components/ui";
import { addStaffAction, changePasswordAction, checkBalanceAction, liveTestSendAction, saveSmsSettingsAction, setAdminActiveAction } from "./actions";

type Init = {
  smsMode: string;
  senderNumber: string;
  rateSms: number;
  rateLms: number;
  rateSource: string;
  dailySendLimit: number;
  includeLinkDefault: boolean;
};

export function SmsSettingsForm({
  initial,
  canEdit,
  liveAvailable,
  published,
  rateUpdatedAt,
}: {
  initial: Init;
  canEdit: boolean;
  liveAvailable: boolean;
  published: { SMS: number; LMS: number; note: string; url: string };
  rateUpdatedAt: string;
}) {
  const [state, action, pending] = useActionState(saveSmsSettingsAction, undefined);
  const [mode, setMode] = useState(initial.smsMode);
  return (
    <ActionForm action={action} pending={pending} className="space-y-5">
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      <fieldset disabled={!canEdit} className="space-y-5">
        <div>
          <span className="label">발송 방식</span>
          <input type="hidden" name="smsMode" value={mode} />
          <div className="grid gap-2 md:grid-cols-2">
            <button type="button" onClick={() => setMode("test")} aria-pressed={mode === "test"} className={`rounded-xl border p-4 text-left ${mode === "test" ? "border-amber-400 bg-amber-50 ring-2 ring-amber-100" : "border-line bg-white"}`}>
              <div className="font-bold">🧪 테스트 모드</div>
              <div className="text-sm text-sub">실제 문자 없이 전 과정을 연습합니다. 요금 0원.</div>
            </button>
            <button
              type="button"
              onClick={() => liveAvailable && setMode("live")}
              aria-pressed={mode === "live"}
              disabled={!liveAvailable}
              className={`rounded-xl border p-4 text-left disabled:opacity-50 ${mode === "live" ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-line bg-white"}`}
            >
              <div className="font-bold">● 실제 발송</div>
              <div className="text-sm text-sub">{liveAvailable ? "입주민에게 실제 문자가 갑니다. 요금 발생." : "서버에 SOLAPI API 키를 먼저 설정해야 합니다."}</div>
            </button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="sender">발신번호</label>
            <input id="sender" name="senderNumber" defaultValue={initial.senderNumber} className="input" placeholder="예: 0212345678 (관리사무소 대표번호)" inputMode="tel" />
            <p className="hint">SOLAPI 콘솔에서 미리 등록·인증한 번호만 쓸 수 있습니다(전기통신사업법 발신번호 사전등록제).</p>
          </div>
          <div>
            <label className="label" htmlFor="limit">하루 발송 한도</label>
            <input id="limit" name="dailySendLimit" type="number" min={1} defaultValue={initial.dailySendLimit} className="input" />
            <p className="hint">실수·무단 대량 발송을 막습니다. 하루(0시 기준) 발송 건수가 넘으면 발송하지 않습니다.</p>
          </div>
        </div>
        <div id="rates" className="rounded-xl border border-line p-4">
          <div className="font-semibold">문자 요금 (건당, VAT 별도)</div>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div>
              <label className="label" htmlFor="rs">단문 SMS (원)</label>
              <input id="rs" name="rateSms" type="number" step="0.1" min="0.1" defaultValue={initial.rateSms} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="rl">장문 LMS (원)</label>
              <input id="rl" name="rateLms" type="number" step="0.1" min="0.1" defaultValue={initial.rateLms} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="rsrc">요금 출처 메모</label>
              <input id="rsrc" name="rateSource" defaultValue={initial.rateSource} className="input" />
            </div>
          </div>
          <p className="hint">
            기본값은 {published.note}(SMS {published.SMS}원, LMS {published.LMS}원)입니다. 월 발송량에 따른 할인 단가를 받는다면{" "}
            <a href={published.url} target="_blank" rel="noreferrer" className="underline">SOLAPI 요금표</a>나 콘솔의 본인 단가로 바꿔 주세요. 마지막 변경: {rateUpdatedAt}
          </p>
        </div>
        <label className="flex items-center gap-3">
          <input type="checkbox" name="includeLinkDefault" defaultChecked={initial.includeLinkDefault} className="h-5 w-5 accent-brand-500" />
          새 공지에 &lsquo;공지 확인 링크 넣기&rsquo;를 기본으로 켜기
        </label>
        {canEdit ? <SubmitButton>설정 저장</SubmitButton> : <p className="hint">관리 책임자만 변경할 수 있습니다.</p>}
      </fieldset>
    </ActionForm>
  );
}

export function BalanceCheck({ disabled }: { disabled: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  return (
    <div>
      <button type="button" className="btn-secondary btn-sm" disabled={disabled || pending} onClick={() => start(async () => { const r = await checkBalanceAction(); setMsg({ ok: r.ok, text: r.message ?? r.error ?? "" }); })}>
        {pending ? "확인 중…" : "연결·잔액 확인 (무료)"}
      </button>
      {msg && <p className={`mt-1 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}

export function LiveTestForm() {
  const [state, action, pending] = useActionState(liveTestSendAction, undefined);
  return (
    <details className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <summary className="cursor-pointer font-semibold">실제 발송 연결 테스트 — 내 휴대전화로 1건 보내기</summary>
      <ActionForm action={action} pending={pending} className="mt-3 space-y-3">
        {state?.error && <Alert>{state.error}</Alert>}
        {state?.message && <Alert kind="success">{state.message}</Alert>}
        <input name="to" className="input md:w-72" placeholder="받을 번호 010-0000-0000" inputMode="tel" aria-label="받을 번호" required />
        <label className="flex items-start gap-2 text-[0.95rem]">
          <input type="checkbox" name="confirm" className="mt-1 h-5 w-5 accent-emerald-600" required />
          실제 문자 1건이 발송되어 단문 요금(약 수십 원)이 청구되는 것에 동의합니다.
        </label>
        <SubmitButton className="btn-secondary">1건 보내기</SubmitButton>
      </ActionForm>
    </details>
  );
}

type A = { id: string; name: string; email: string; role: string; active: boolean; lastLoginAt: string | null };

export function AdminList({ list, me, isOwner }: { list: A[]; me: string; isOwner: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {err && <Alert>{err}</Alert>}
      <ul className="divide-y divide-line rounded-xl border border-line">
        {list.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div>
              <span className="font-semibold">{a.name}</span> <span className="text-sm text-sub">{a.email}</span>
              <span className={`badge ml-2 ${a.role === "owner" ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-700"}`}>{a.role === "owner" ? "관리 책임자" : "직원"}</span>
              {!a.active && <span className="badge ml-1 bg-red-50 text-red-700">비활성</span>}
              {a.id === me && <span className="ml-1 text-xs text-sub">(나)</span>}
              <div className="text-xs text-sub">최근 로그인 {a.lastLoginAt ?? "-"}</div>
            </div>
            {isOwner && a.role !== "owner" && (
              <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => setErr((await setAdminActiveAction(a.id, !a.active))?.error ?? null))}>
                {a.active ? "비활성화" : "다시 사용"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StaffForm() {
  const [state, action, pending] = useActionState(addStaffAction, undefined);
  return (
    <ActionForm action={action} pending={pending} className="grid gap-3 md:grid-cols-3" key={state?.message}>
      {state?.error && <div className="md:col-span-3"><Alert>{state.error}</Alert></div>}
      {state?.message && <div className="md:col-span-3"><Alert kind="success">{state.message}</Alert></div>}
      <input name="name" className="input" placeholder="이름" aria-label="이름" required />
      <input name="email" type="email" className="input" placeholder="이메일" aria-label="이메일" required />
      <input name="password" type="password" className="input" placeholder="임시 비밀번호(10자 이상)" aria-label="임시 비밀번호" required autoComplete="new-password" />
      <div><SubmitButton className="btn-secondary">계정 추가</SubmitButton></div>
    </ActionForm>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <ActionForm action={action} pending={pending} className="grid gap-3 md:grid-cols-3">
      {state?.error && <div className="md:col-span-3"><Alert>{state.error}</Alert></div>}
      {state?.message && <div className="md:col-span-3"><Alert kind="success">{state.message}</Alert></div>}
      <input name="current" type="password" className="input" placeholder="현재 비밀번호" aria-label="현재 비밀번호" required autoComplete="current-password" />
      <input name="next" type="password" className="input" placeholder="새 비밀번호" aria-label="새 비밀번호" required autoComplete="new-password" />
      <input name="next2" type="password" className="input" placeholder="새 비밀번호 확인" aria-label="새 비밀번호 확인" required autoComplete="new-password" />
      <div><SubmitButton className="btn-secondary">변경</SubmitButton></div>
    </ActionForm>
  );
}
