import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/auth";
import { TEMPLATE_CSV } from "@/lib/import-parse";

export async function GET() {
  if (!(await getAdminContext())) return NextResponse.redirect(new URL("/login", process.env.APP_URL ?? "http://localhost:3000"));
  return new NextResponse(TEMPLATE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("아파트온_연락처_양식.csv")}`,
    },
  });
}
