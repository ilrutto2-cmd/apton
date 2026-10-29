"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ActionForm, Alert, SubmitButton } from "@/components/ui";
import { CONSENT_BASIS_OPTIONS } from "@/lib/contacts-shared";
import { importAction } from "../actions";

export function ImportForm() {
  const [state, action, pending] = useActionState(importAction, undefined);
  const [def, setDef] = useState<"pending" | "agreed">("pending");
  const rep = state?.report;
  return (
    <div className="space-y-5">
      <ActionForm action={action} pending={pending} className="card space-y-5 p-5">
        {state?.error && <Alert>{state.error}</Alert>}
        <div>
          <label className="label" htmlFor="file">파일 선택</label>
          <input id="file" name="file" type="file" accept=".xlsx,.csv,.txt" required className="block w-full rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-4 text-[0.95rem] file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:font-semibold file:text-white" />
        </div>
        <div>
          <span className="label">수신동의 칸이 비어 있는 줄은</span>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input type="radio" name="defaultConsent" value="pending" checked={def === "pending"} onChange={() => setDef("pending")} className="h-5 w-5 accent-brand-500" />
              동의 확인 전으로 등록 (발송 제외, 나중에 확인) — 권장
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="defaultConsent" value="agreed" checked={def === "agreed"} onChange={() => setDef("agreed")} className="h-5 w-5 accent-brand-500" />
              모두 수신 동의를 받았음 (동의서 등 근거 보유)
            </label>
          </div>
          {def === "agreed" && (
            <select name="defaultBasis" className="input mt-2" defaultValue="서면 동의서" aria-label="동의 받은 방법">
              {CONSENT_BASIS_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          )}
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="createMissing" className="h-5 w-5 accent-brand-500" />
          등록되지 않은 동·호수는 자동으로 만들기
        </label>
        <SubmitButton pendingText="등록하는 중…">올리고 등록하기</SubmitButton>
      </ActionForm>

      {rep && (
        <div className="card space-y-3 p-5" aria-live="polite">
          <h2 className="section-title">등록 결과</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-emerald-50 p-3"><div className="text-2xl font-extrabold text-emerald-700">{rep.added}</div><div className="text-sm">새로 등록</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-2xl font-extrabold text-slate-600">{rep.duplicates}</div><div className="text-sm">이미 있어 건너뜀</div></div>
            <div className="rounded-xl bg-red-50 p-3"><div className="text-2xl font-extrabold text-red-600">{rep.errors.length}</div><div className="text-sm">오류</div></div>
          </div>
          {rep.createdUnits > 0 && <p className="text-sm text-sub">새로 만든 호수: {rep.createdUnits}개</p>}
          {rep.errors.length > 0 && (
            <div>
              <h3 className="font-bold text-red-700">오류가 난 줄 (등록되지 않음)</h3>
              <ul className="mt-1 max-h-60 list-disc overflow-auto pl-5 text-[0.95rem]">
                {rep.errors.map((e, i) => (
                  <li key={i}>{e.row}번째 줄: {e.reason}</li>
                ))}
              </ul>
            </div>
          )}
          {rep.warnings.length > 0 && (
            <div>
              <h3 className="font-bold text-amber-700">참고</h3>
              <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 text-[0.95rem]">
                {rep.warnings.map((e, i) => (
                  <li key={i}>{e.row}번째 줄: {e.reason}</li>
                ))}
              </ul>
            </div>
          )}
          <Link href="/residents" className="btn-primary">연락처 목록 보기</Link>
        </div>
      )}
    </div>
  );
}
