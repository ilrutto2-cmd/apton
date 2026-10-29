import Papa from "papaparse";
import iconv from "iconv-lite";
import ExcelJS from "exceljs";
import type { ImportRow } from "./contacts";

const COLS: Record<keyof ImportRow, string[]> = {
  building: ["동", "동명", "동번호", "building"],
  unit: ["호", "호수", "호실", "unit"],
  phone: ["전화번호", "휴대전화", "휴대전화번호", "휴대폰", "핸드폰", "연락처", "phone", "mobile"],
  name: ["이름", "성명", "별칭", "이름(별칭)", "name"],
  consent: ["수신동의", "동의", "문자수신동의", "수신 동의", "consent"],
  basis: ["동의근거", "동의 근거", "동의방법", "basis"],
};

function mapHeader(header: string[]): Partial<Record<keyof ImportRow, number>> | string {
  const norm = header.map((h) => String(h ?? "").replace(/\s|\*|\(필수\)|\(선택\)/g, "").toLowerCase());
  const idx: Partial<Record<keyof ImportRow, number>> = {};
  for (const [key, names] of Object.entries(COLS) as [keyof ImportRow, string[]][]) {
    const i = norm.findIndex((h) => names.map((n) => n.replace(/\s/g, "").toLowerCase()).includes(h));
    if (i >= 0) idx[key] = i;
  }
  const missing = (["building", "unit", "phone"] as const).filter((k) => idx[k] === undefined);
  if (missing.length) {
    const lbl = { building: "동", unit: "호수", phone: "전화번호" };
    return `첫 줄(제목)에서 ${missing.map((m) => `'${lbl[m]}'`).join(", ")} 열을 찾지 못했습니다. 양식 파일을 내려받아 사용해 주세요.`;
  }
  return idx;
}

function toRows(table: string[][]): ImportRow[] | string {
  const nonEmpty = table.filter((r) => r.some((c) => String(c ?? "").trim()));
  if (nonEmpty.length < 2) return "등록할 내용이 없습니다. 첫 줄은 제목, 둘째 줄부터 연락처를 입력하세요.";
  const idx = mapHeader(nonEmpty[0]);
  if (typeof idx === "string") return idx;
  const get = (r: string[], k: keyof ImportRow) => (idx[k] !== undefined ? String(r[idx[k]!] ?? "").trim() : "");
  return nonEmpty.slice(1).map((r) => ({
    building: get(r, "building"),
    unit: get(r, "unit"),
    phone: get(r, "phone"),
    name: get(r, "name"),
    consent: get(r, "consent"),
    basis: get(r, "basis"),
  }));
}

/** 한국어 엑셀이 저장한 CSV(CP949)와 UTF-8 CSV를 모두 읽는다 */
export function decodeCsv(buf: Buffer): string {
  const utf8 = buf.toString("utf8").replace(/^﻿/, "");
  if (!utf8.includes("�")) return utf8;
  return iconv.decode(buf, "cp949");
}

export async function parseImportFile(name: string, buf: Buffer): Promise<ImportRow[] | string> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = decodeCsv(buf);
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
    return toRows(parsed.data);
  }
  if (lower.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
    } catch {
      return "엑셀 파일을 읽을 수 없습니다. .xlsx 형식인지 확인해 주세요.";
    }
    const ws = wb.worksheets[0];
    if (!ws) return "엑셀 파일에 시트가 없습니다.";
    const table: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const v = cell.value as unknown;
        let s: string;
        if (v == null) s = "";
        else if (typeof v === "object" && v !== null && "text" in v) s = String((v as { text: unknown }).text);
        else if (typeof v === "object" && v !== null && "result" in v) s = String((v as { result: unknown }).result);
        else s = String(v);
        vals[col - 1] = s;
      });
      table.push(Array.from(vals, (x) => x ?? ""));
    });
    return toRows(table);
  }
  if (lower.endsWith(".xls")) return "옛 엑셀 형식(.xls)은 지원하지 않습니다. 엑셀에서 '다른 이름으로 저장 → .xlsx' 후 올려 주세요.";
  return "CSV 또는 엑셀(.xlsx) 파일만 올릴 수 있습니다.";
}

export const TEMPLATE_CSV =
  "﻿동,호수,전화번호,이름(선택),수신동의,동의근거(선택)\n101동,301,010-0000-1111,입주민A,예,서면 동의서\n101동,301,010-0000-2222,입주민B,예,전화 확인\n102동,1203,010-0000-3333,,예,\n";
