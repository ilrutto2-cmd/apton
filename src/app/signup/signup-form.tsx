"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ActionForm, Alert, SubmitButton } from "@/components/ui";
import { signupAction } from "../login/actions";

export function SignupForm({ needCode }: { needCode: boolean }) {
  const [state, action, pending] = useActionState(signupAction, undefined);
  return (
    <ActionForm action={action} pending={pending} className="space-y-5">
      {state?.error && <Alert>{state.error}</Alert>}
      {needCode && (
        <div>
          <label className="label" htmlFor="code">가입 코드</label>
          <input id="code" name="code" required className="input" autoComplete="off" />
          <p className="hint">외부인 무단 가입(문자 요금 발생)을 막기 위한 코드입니다. 서비스 운영자에게 받으세요.</p>
        </div>
      )}
      <fieldset className="space-y-4">
        <legend className="mb-2 text-base font-bold text-brand-700">아파트 정보</legend>
        <div>
          <label className="label" htmlFor="aptName">아파트 이름 *</label>
          <input id="aptName" name="aptName" required className="input" placeholder="예: 행복아파트" />
        </div>
        <div>
          <label className="label" htmlFor="address">주소</label>
          <input id="address" name="address" className="input" placeholder="예: 서울시 ○○구 ○○로 12" />
        </div>
        <div>
          <label className="label" htmlFor="officePhone">관리사무소 전화번호</label>
          <input id="officePhone" name="officePhone" className="input" placeholder="예: 02-123-4567" inputMode="tel" />
          <p className="hint">문자 끝 &lsquo;문의&rsquo; 줄에 표시됩니다.</p>
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-2 text-base font-bold text-brand-700">관리자 계정</legend>
        <div>
          <label className="label" htmlFor="ownerName">이름 *</label>
          <input id="ownerName" name="ownerName" required className="input" placeholder="예: 김관리" />
        </div>
        <div>
          <label className="label" htmlFor="email">이메일(로그인 아이디) *</label>
          <input id="email" name="email" type="email" required className="input" autoComplete="username" />
        </div>
        <div>
          <label className="label" htmlFor="password">비밀번호 *</label>
          <input id="password" name="password" type="password" required minLength={10} className="input" autoComplete="new-password" />
          <p className="hint">10자 이상, 영문과 숫자를 함께 사용하세요.</p>
        </div>
        <div>
          <label className="label" htmlFor="password2">비밀번호 확인 *</label>
          <input id="password2" name="password2" type="password" required className="input" autoComplete="new-password" />
        </div>
      </fieldset>
      <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-[0.95rem]">
        <input type="checkbox" name="agree" className="mt-1 h-5 w-5 accent-brand-500" required />
        <span>
          관리사무소는 입주민 연락처의 <b>개인정보 처리자</b>로서 수집·이용 근거(동의 등)를 갖추고, 아파트 관리 목적의 정보성 안내에만 사용합니다.{" "}
          <Link href="/terms" target="_blank" className="text-brand-600 underline">이용약관</Link>과{" "}
          <Link href="/privacy" target="_blank" className="text-brand-600 underline">개인정보 처리방침</Link>을 확인했습니다.
        </span>
      </label>
      <SubmitButton className="btn-primary w-full" pendingText="등록 중…">등록하고 시작하기</SubmitButton>
    </ActionForm>
  );
}
