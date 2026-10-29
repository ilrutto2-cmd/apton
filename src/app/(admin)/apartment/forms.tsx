"use client";

import { useActionState, useState, useTransition } from "react";
import { ActionForm, Alert, SubmitButton } from "@/components/ui";
import { addBuildingAction, addUnitsAction, deleteBuildingAction, deleteUnitsAction, updateApartmentAction } from "./actions";

export function ApartmentInfoForm({ apt, canEdit }: { apt: { name: string; address: string; officePhone: string }; canEdit: boolean }) {
  const [state, action, pending] = useActionState(updateApartmentAction, undefined);
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      <div>
        <label className="label" htmlFor="apt-name">아파트 이름</label>
        <input id="apt-name" name="name" defaultValue={apt.name} className="input" required disabled={!canEdit} />
        <p className="hint">문자 첫 줄 [{apt.name} 관리사무소]에 쓰입니다.</p>
      </div>
      <div>
        <label className="label" htmlFor="apt-address">주소</label>
        <input id="apt-address" name="address" defaultValue={apt.address} className="input" disabled={!canEdit} />
      </div>
      <div>
        <label className="label" htmlFor="apt-phone">관리사무소 전화번호</label>
        <input id="apt-phone" name="officePhone" defaultValue={apt.officePhone} className="input" inputMode="tel" disabled={!canEdit} />
      </div>
      {canEdit ? <SubmitButton className="btn-secondary">저장</SubmitButton> : <p className="hint">관리 책임자만 수정할 수 있습니다.</p>}
    </ActionForm>
  );
}

export function AddBuildingForm() {
  const [state, action, pending] = useActionState(addBuildingAction, undefined);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [floors, setFloors] = useState({ from: 1, to: 15, per: 4 });
  const total = Math.max(0, floors.to - floors.from + 1) * floors.per;
  return (
    <ActionForm action={action} pending={pending} className="space-y-4" key={state?.message}>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      <div>
        <label className="label" htmlFor="b-name">동 이름</label>
        <input id="b-name" name="name" className="input" placeholder="예: 101동" required />
      </div>
      <input type="hidden" name="mode" value={mode} />
      <div className="flex gap-2" role="radiogroup" aria-label="호수 만드는 방법">
        <button type="button" role="radio" aria-checked={mode === "auto"} className={`chip ${mode === "auto" ? "chip-on" : ""}`} onClick={() => setMode("auto")}>층·세대 수로 자동 생성</button>
        <button type="button" role="radio" aria-checked={mode === "manual"} className={`chip ${mode === "manual" ? "chip-on" : ""}`} onClick={() => setMode("manual")}>직접 입력</button>
      </div>
      {mode === "auto" ? (
        <div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="ff">시작 층</label>
              <input id="ff" name="floorFrom" type="number" min={1} value={floors.from} onChange={(e) => setFloors({ ...floors, from: Number(e.target.value) })} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="ft">꼭대기 층</label>
              <input id="ft" name="floorTo" type="number" min={1} max={80} value={floors.to} onChange={(e) => setFloors({ ...floors, to: Number(e.target.value) })} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="pf">층당 세대</label>
              <input id="pf" name="perFloor" type="number" min={1} max={20} value={floors.per} onChange={(e) => setFloors({ ...floors, per: Number(e.target.value) })} className="input" />
            </div>
          </div>
          <p className="hint">
            {total > 0 ? (
              <>
                {floors.from}01호 ~ {floors.to}
                {String(floors.per).padStart(2, "0")}호, 총 <b>{total}세대</b>가 만들어집니다.
              </>
            ) : (
              "층수를 확인해 주세요."
            )}
          </p>
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="ul">호수 목록</label>
          <textarea id="ul" name="unitList" rows={3} className="input" placeholder="예: 101, 102, 201~204, 301" />
          <p className="hint">쉼표나 줄바꿈으로 구분하고, 연속된 호수는 201~204처럼 쓸 수 있습니다.</p>
        </div>
      )}
      <SubmitButton className="btn-primary" pendingText="추가 중…">동 추가</SubmitButton>
    </ActionForm>
  );
}

type U = { id: string; unitNo: string; floor: number | null; contactCount: number };

export function BuildingCard({ building, units }: { building: { id: string; name: string }; units: U[] }) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [state, action, formPending] = useActionState(addUnitsAction, undefined);
  const byFloor = new Map<string, U[]>();
  for (const u of units) {
    const k = u.floor != null ? `${u.floor}층` : "기타";
    byFloor.set(k, [...(byFloor.get(k) ?? []), u]);
  }
  const floors = [...byFloor.entries()].sort((a, b) => (parseInt(b[0]) || -1) - (parseInt(a[0]) || -1));
  const withContacts = units.filter((u) => u.contactCount > 0).length;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h3 className="text-xl font-bold">{building.name}</h3>
          <p className="text-sm text-sub">
            {units.length}세대 · 연락처 등록 {withContacts}세대
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "접기" : "호수 보기·추가"}
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm text-red-600"
            disabled={pending}
            onClick={() => {
              if (!confirm(`${building.name}을(를) 삭제할까요? (연락처가 없는 경우에만 삭제됩니다)`)) return;
              start(async () => {
                const r = await deleteBuildingAction(building.id);
                setErr(r?.error ?? null);
              });
            }}
          >
            동 삭제
          </button>
        </div>
      </div>
      {err && <div className="px-5 pb-4"><Alert>{err}</Alert></div>}
      {open && (
        <div className="border-t border-line bg-slate-50/60 p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setSelecting(!selecting); setSel([]); }}>
              {selecting ? "선택 취소" : "호수 삭제하기"}
            </button>
            {selecting && (
              <button
                type="button"
                className="btn-danger btn-sm"
                disabled={!sel.length || pending}
                onClick={() =>
                  start(async () => {
                    const r = await deleteUnitsAction(sel);
                    setErr(r?.error ?? null);
                    if (!r?.error) { setSel([]); setSelecting(false); }
                  })
                }
              >
                선택한 {sel.length}개 삭제
              </button>
            )}
          </div>
          <div className="max-h-96 space-y-1.5 overflow-auto">
            {floors.map(([f, us]) => (
              <div key={f} className="flex items-start gap-2">
                <span className="w-12 shrink-0 pt-1.5 text-right text-sm font-semibold text-sub">{f}</span>
                <div className="flex flex-wrap gap-1.5">
                  {us.map((u) => {
                    const on = sel.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        disabled={!selecting || u.contactCount > 0}
                        onClick={() => setSel(on ? sel.filter((x) => x !== u.id) : [...sel, u.id])}
                        title={u.contactCount ? `연락처 ${u.contactCount}건` : "연락처 없음"}
                        className={`min-w-14 rounded-lg border px-2 py-1 text-sm ${
                          on ? "border-red-400 bg-red-50 text-red-700" : u.contactCount ? "border-brand-200 bg-white font-semibold text-brand-700" : "border-line bg-white text-sub"
                        } ${selecting && !u.contactCount ? "cursor-pointer" : "cursor-default"}`}
                      >
                        {u.unitNo}
                        {u.contactCount > 0 && <span className="ml-1 text-xs">·{u.contactCount}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <ActionForm action={action} pending={formPending} className="mt-4 flex flex-col gap-2 sm:flex-row" key={state?.message}>
            <input type="hidden" name="buildingId" value={building.id} />
            <input name="unitList" className="input" placeholder="추가할 호수 예: 1601, 1602 또는 1601~1604" aria-label="추가할 호수" />
            <SubmitButton className="btn-secondary shrink-0">호수 추가</SubmitButton>
          </ActionForm>
          {state?.error && <div className="mt-2"><Alert>{state.error}</Alert></div>}
          {state?.message && <div className="mt-2"><Alert kind="success">{state.message}</Alert></div>}
          <p className="hint">파란 숫자는 연락처가 등록된 세대(·뒤 숫자는 연락처 수)입니다.</p>
        </div>
      )}
    </div>
  );
}
