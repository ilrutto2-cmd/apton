"use client";

import { createContext, startTransition, useContext } from "react";
import { useFormStatus } from "react-dom";

const PendingCtx = createContext(false);

/**
 * 서버 액션 폼. 제출 후 입력값이 지워지지 않도록(오류가 나도 다시 입력하지 않게) 직접 제출한다.
 */
export function ActionForm({
  action,
  pending,
  children,
  ...rest
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & { action: (fd: FormData) => void; pending: boolean }) {
  return (
    <PendingCtx.Provider value={pending}>
      <form
        {...rest}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => action(fd));
        }}
      >
        {children}
      </form>
    </PendingCtx.Provider>
  );
}

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-11 w-11 text-xl" : "h-9 w-9 text-base";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`grid ${box} place-items-center rounded-xl bg-brand-500 font-black text-white shadow-sm`} aria-hidden>
        <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20V9l8-5 8 5v11" />
          <path d="M9 20v-5h6v5" />
          <path d="M17.5 3.5c1.2.6 2 1.6 2.4 2.9" />
        </svg>
      </span>
      <span className={`${size === "lg" ? "text-2xl" : "text-lg"} font-extrabold tracking-tight text-ink`}>
        아파트온
      </span>
    </span>
  );
}

export function SubmitButton({
  children,
  pendingText = "처리 중…",
  className = "btn-primary",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const status = useFormStatus();
  const ctxPending = useContext(PendingCtx);
  const pending = status.pending || ctxPending;
  return (
    <button type="submit" className={className} disabled={pending || rest.disabled} {...rest}>
      {pending ? pendingText : children}
    </button>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "info" | "success" | "warn"; children: React.ReactNode }) {
  const cls = {
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-brand-200 bg-brand-50 text-brand-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-[0.95rem] ${cls}`}>
      {children}
    </div>
  );
}
