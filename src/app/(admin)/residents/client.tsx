"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { ActionForm, Alert, SubmitButton } from "@/components/ui";
import { CONSENT_BASIS_OPTIONS, CONSENT_LABELS } from "@/lib/contacts-shared";
import {
  addContactAction,
  deleteContactAction,
  purgeSampleAction,
  revealPhoneAction,
  setActiveAction,
  updateContactAction,
} from "./actions";

type B = { id: string; name: string };
type U = { id: string; buildingId: string; unitNo: string };

function ConsentFields({ defaultStatus = "agreed", defaultBasis = "서면 동의서", idPrefix }: { defaultStatus?: string; defaultBasis?: string; idPrefix: string }) {
  const [status, setStatus] = useState(defaultStatus);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="label" htmlFor={`${idPrefix}-consent`}>문자 수신 동의</label>
        <select id={`${idPrefix}-consent`} name="consentStatus" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(CONSENT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}{k === "agreed" ? " (발송 대상)" : " (발송 제외)"}</option>
          ))}
        </select>
      </div>
      {status === "agreed" && (
        <div>
          <label className="label" htmlFor={`${idPrefix}-basis`}>동의 받은 방법</label>
          <select id={`${idPrefix}-basis`} name="consentBasis" className="input" defaultValue={defaultBasis || "서면 동의서"}>
            {CONSENT_BASIS_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export function UnitPicker({ buildings, units, name = "unitId" }: { buildings: B[]; units: U[]; name?: string }) {
  const [b, setB] = useState(buildings[0]?.id ?? "");
  const list = useMemo(() => units.filter((u) => u.buildingId === b), [units, b]);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="label" htmlFor="pick-b">동</label>
        <select id="pick-b" className="input" value={b} onChange={(e) => setB(e.target.value)}>
          {buildings.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="pick-u">호수</label>
        <select id="pick-u" name={name} className="input" required key={b}>
          <option value="">선택</option>
          {list.map((u) => (
            <option key={u.id} value={u.id}>{u.unitNo}호</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function AddContactPanel({ buildings, units }: { buildings: B[]; units: U[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addContactAction, undefined);
  return (
    <div className="card">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between p-5 text-left" aria-expanded={open}>
        <span className="text-lg font-bold">＋ 연락처 한 명씩 등록</span>
        <span className="text-sub">{open ? "닫기 ▲" : "열기 ▼"}</span>
      </button>
      {open && (
        <ActionForm action={action} pending={pending} className="space-y-4 border-t border-line p-5" key={state?.message ? Math.random() : "form"}>
          {state?.error && <Alert>{state.error}</Alert>}
          {state?.message && <Alert kind="success">{state.message}</Alert>}
          {state?.warning && <Alert kind="warn">{state.warning}</Alert>}
          <UnitPicker buildings={buildings} units={units} />
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="c-phone">휴대전화 번호</label>
              <input id="c-phone" name="phone" className="input" inputMode="tel" placeholder="010-0000-0000" required />
            </div>
            <div>
              <label className="label" htmlFor="c-name">이름 또는 별칭 (선택)</label>
              <input id="c-name" name="name" className="input" placeholder="예: 301호 어머님" />
            </div>
          </div>
          <ConsentFields idPrefix="add" />
          <p className="hint">한 세대에 여러 번호를 등록할 수 있습니다. 같은 번호가 여러 세대에 있어도 한 공지는 한 번만 발송됩니다.</p>
          <SubmitButton pendingText="등록 중…">등록</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

type Row = {
  id: string;
  name: string;
  last4: string;
  consent: string;
  basis: string;
  active: boolean;
  reason: string | null;
  isSample: boolean;
  building: string;
  unitNo: string;
};

function ConsentBadge({ s }: { s: string }) {
  const cls = s === "agreed" ? "bg-emerald-50 text-emerald-700" : s === "pending" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700";
  return <span className={`badge ${cls}`}>{CONSENT_LABELS[s] ?? s}</span>;
}

export function ContactTable({ rows }: { rows: Row[] }) {
  if (!rows.length) return <div className="card p-8 text-center text-sub">조건에 맞는 연락처가 없습니다.</div>;
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>동·호수</th>
              <th>이름</th>
              <th>전화번호</th>
              <th>수신 동의</th>
              <th className="text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <ContactRow key={r.id} r={r} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContactRow({ r }: { r: Row }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [state, action, formPending] = useActionState(updateContactAction, undefined);
  return (
    <>
      <tr className={r.active ? "" : "bg-slate-50 text-slate-500"}>
        <td className="whitespace-nowrap font-semibold">
          {r.building} {r.unitNo}호
          {r.isSample && <span className="badge ml-1.5 bg-violet-100 text-violet-700">샘플</span>}
        </td>
        <td>{r.name || <span className="text-slate-400">-</span>}</td>
        <td className="whitespace-nowrap font-mono text-[0.95rem]">
          {phone ?? `***-****-${r.last4}`}
          {!phone && (
            <button
              type="button"
              className="ml-2 text-sm font-semibold text-brand-600 underline"
              onClick={() =>
                start(async () => {
                  const x = await revealPhoneAction(r.id);
                  if (x.phone) setPhone(x.phone);
                  else setErr(x.error ?? "오류");
                })
              }
            >
              보기
            </button>
          )}
        </td>
        <td>
          {r.active ? <ConsentBadge s={r.consent} /> : <span className="badge bg-slate-200 text-slate-600">비활성{r.reason ? `·${r.reason}` : ""}</span>}
        </td>
        <td className="text-right whitespace-nowrap">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(!editing)}>
            {editing ? "닫기" : "수정"}
          </button>
          {r.active ? (
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                const reason = prompt("비활성화 사유 (예: 전출, 번호 변경)", "전출");
                if (reason === null) return;
                start(async () => setErr((await setActiveAction(r.id, false, reason))?.error ?? null));
              }}
            >
              전출 처리
            </button>
          ) : (
            <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => setErr((await setActiveAction(r.id, true))?.error ?? null))}>
              다시 사용
            </button>
          )}
          <button
            type="button"
            className="btn-ghost btn-sm text-red-600"
            disabled={pending}
            onClick={() => {
              if (!confirm(`${r.building} ${r.unitNo}호 연락처(끝자리 ${r.last4})를 삭제할까요? 되돌릴 수 없습니다.`)) return;
              start(async () => setErr((await deleteContactAction(r.id))?.error ?? null));
            }}
          >
            삭제
          </button>
        </td>
      </tr>
      {(editing || err) && (
        <tr>
          <td colSpan={5} className="bg-brand-50/40">
            {err && <Alert>{err}</Alert>}
            {editing && (
              <ActionForm action={action} pending={formPending} className="space-y-3 py-2">
                {state?.error && <Alert>{state.error}</Alert>}
                {state?.message && <Alert kind="success">{state.message}</Alert>}
                {state?.warning && <Alert kind="warn">{state.warning}</Alert>}
                <input type="hidden" name="id" value={r.id} />
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`n-${r.id}`}>이름 또는 별칭</label>
                    <input id={`n-${r.id}`} name="name" defaultValue={r.name} className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`p-${r.id}`}>새 전화번호 (바꿀 때만 입력)</label>
                    <input id={`p-${r.id}`} name="phone" className="input" inputMode="tel" placeholder={`현재 끝자리 ${r.last4}`} />
                  </div>
                </div>
                <ConsentFields idPrefix={`e-${r.id}`} defaultStatus={r.consent} defaultBasis={r.basis} />
                <SubmitButton className="btn-primary btn-sm">저장</SubmitButton>
              </ActionForm>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function SamplePurge({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-violet-900">
      <span>
        체험용 <b>샘플 연락처 {count}건</b>이 있습니다. 샘플은 테스트 모드에서만 쓰이며 실제 발송에서는 항상 제외됩니다.
        {msg && <b className="ml-2">{msg}</b>}
      </span>
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending}
        onClick={() => {
          if (!confirm("샘플 연락처를 모두 삭제할까요?")) return;
          start(async () => setMsg((await purgeSampleAction())?.message ?? null));
        }}
      >
        샘플 모두 삭제
      </button>
    </div>
  );
}
