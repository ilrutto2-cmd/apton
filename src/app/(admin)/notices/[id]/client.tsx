"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cancelDispatchAction, deleteDraftAction, refreshResultsAction, resendFailedAction } from "../actions";

/** 결과가 아직 들어오는 중이면 5초마다 화면을 새로 고친다 */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [active, router]);
  return active ? (
    <div className="flex items-center gap-2 text-sm text-sky-700" role="status">
      <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-sky-500" />
      발송 결과를 받아오는 중입니다. 화면이 자동으로 갱신됩니다.
    </div>
  ) : null;
}

export function CancelButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn-secondary btn-sm text-red-600"
        disabled={pending}
        onClick={() => {
          if (!confirm(`'${label}' 발송을 취소할까요?`)) return;
          start(async () => setErr((await cancelDispatchAction(id)).error ?? null));
        }}
      >
        {pending ? "취소 중…" : "이 발송 취소"}
      </button>
      {err && <span className="text-sm text-red-600">{err}</span>}
    </>
  );
}

export function ResendButtons({ dispatchId, failed, unknown }: { dispatchId: string; failed: number; unknown: number }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  return (
    <>
      {failed > 0 && (
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={pending}
          onClick={() => {
            if (!confirm(`실패한 ${failed}건에 다시 보낼까요? (현재 수신 동의·사용 중인 번호만 발송)`)) return;
            start(async () => setErr((await resendFailedAction(dispatchId, false, key + ":f")).error ?? null));
          }}
        >
          실패 {failed}건 재발송
        </button>
      )}
      {unknown > 0 && (
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={pending}
          onClick={() => {
            if (!confirm(`'결과 확인 불가' ${unknown}건은 이미 받았을 수도 있습니다. 문자 서비스 콘솔에서 먼저 확인하는 것을 권장합니다.\n그래도 실패·확인불가 건 모두 다시 보낼까요?`)) return;
            start(async () => setErr((await resendFailedAction(dispatchId, true, key + ":u")).error ?? null));
          }}
        >
          확인 불가 포함 재발송
        </button>
      )}
      {err && <span className="text-sm text-red-600">{err}</span>}
    </>
  );
}

export function DeleteDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-ghost text-red-600"
      disabled={pending}
      onClick={() => {
        if (!confirm("임시 저장한 공지를 삭제할까요?")) return;
        start(async () => {
          const r = await deleteDraftAction(id);
          if (r.ok) router.push("/notices");
          else alert(r.error);
        });
      }}
    >
      삭제
    </button>
  );
}

export function RefreshButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn-ghost" disabled={pending} onClick={() => start(async () => void (await refreshResultsAction(id)))}>
      {pending ? "확인 중…" : "↻ 결과 새로 확인"}
    </button>
  );
}
