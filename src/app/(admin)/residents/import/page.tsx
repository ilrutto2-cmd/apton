import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ImportForm } from "./form";

export const metadata = { title: "연락처 일괄 등록" };

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/residents" className="text-sm font-semibold text-brand-600">← 입주민 연락처</Link>
        <h1 className="mt-1 text-2xl font-bold">엑셀·CSV로 한 번에 등록</h1>
      </div>
      <ol className="card space-y-3 p-5 text-[0.98rem]">
        <li>
          <b>1.</b> 양식 파일을 내려받습니다.{" "}
          <a href="/residents/template" className="btn-secondary btn-sm ml-1">⬇ 양식 내려받기 (CSV)</a>
        </li>
        <li><b>2.</b> 엑셀에서 열어 <b>동, 호수, 전화번호</b>(필수)와 이름, 수신동의(예/아니오), 동의근거를 채웁니다. 예시 줄은 지우세요.</li>
        <li><b>3.</b> 저장한 파일(.xlsx 또는 .csv)을 아래에서 올립니다. 잘못된 줄은 건너뛰고 이유를 알려 드립니다.</li>
      </ol>
      <ImportForm />
    </div>
  );
}
