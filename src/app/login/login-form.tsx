"use client";

import { useActionState } from "react";
import { ActionForm, Alert, SubmitButton } from "@/components/ui";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <ActionForm action={action} pending={pending} className="space-y-4">
      {state?.error && <Alert>{state.error}</Alert>}
      <div>
        <label className="label" htmlFor="email">이메일</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">비밀번호</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <SubmitButton className="btn-primary w-full" pendingText="로그인 중…">로그인</SubmitButton>
    </ActionForm>
  );
}
