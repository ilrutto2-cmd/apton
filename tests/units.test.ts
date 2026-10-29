import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import iconv from "iconv-lite";
import { inventedNumbers } from "@/lib/ai";
import { generateUnitNumbers, parseUnitList } from "@/lib/apartment";
import { parseConsent } from "@/lib/contacts-shared";
import { decrypt, encrypt, phoneHash } from "@/lib/crypto";
import { parseImportFile } from "@/lib/import-parse";
import { planSends } from "@/lib/notice-plan";
import { buildSmsText } from "@/lib/notice-templates";
import { normalizeMobile } from "@/lib/phone";
import { detectType, smsBytes } from "@/lib/sms/message";
import { kstToDate } from "@/lib/time";

describe("문자 길이·종류", () => {
  it("한글 2바이트, 영문 1바이트로 계산하고 90바이트 넘으면 LMS", () => {
    expect(smsBytes("가a")).toBe(3);
    expect(detectType("가".repeat(45))).toBe("SMS");
    expect(detectType("가".repeat(46))).toBe("LMS");
  });
});

describe("문자 본문 템플릿", () => {
  it("요구사항 예시와 같은 형식으로 만든다", () => {
    const t = buildSmsText({
      apartmentName: "행복아파트",
      officePhone: "",
      isEmergency: false,
      title: "엘리베이터 정기 점검 안내",
      body: "점검 시간 동안 엘리베이터 이용이 제한될 예정입니다.\n입주민 여러분의 양해 부탁드립니다.",
      startsAt: kstToDate("2026-11-02", "10:00"),
      endsAt: kstToDate("2026-11-02", "13:00"),
      targetLabel: "101동",
    });
    expect(t).toBe(
      "[행복아파트 관리사무소]\n\n엘리베이터 정기 점검 안내\n\n일시: 11월 2일(월)\n시간: 오전 10시 ~ 오후 1시\n대상: 101동\n\n점검 시간 동안 엘리베이터 이용이 제한될 예정입니다.\n입주민 여러분의 양해 부탁드립니다.\n\n문의: 관리사무소",
    );
  });
  it("긴급 공지는 머리말이 다르다", () => {
    const t = buildSmsText({ apartmentName: "행복아파트", officePhone: "02-1", isEmergency: true, title: "단수", body: "", startsAt: null, endsAt: null, targetLabel: "102동" });
    expect(t.startsWith("[행복아파트 긴급안내]")).toBe(true);
    expect(t).toContain("문의: 관리사무소 02-1");
  });
});

describe("예약·재안내 계획", () => {
  const base = { requestKey: "k".repeat(10), category: "elevator", title: "t", body: "", startDate: "", startTime: "", endDate: "", endTime: "", target: { type: "all" as const }, visibility: "public" as const, includeLink: false, isEmergency: false, smsText: "x", smsTextEdited: false, scheduleDate: "", scheduleTime: "", extraTimes: [] };
  const now = kstToDate("2026-11-01", "12:00")!;
  it("3일 전·1일 전 오전 9시, 당일 오전 8시를 만들고 지난 시각은 건너뛴다", () => {
    const startsAt = kstToDate("2026-11-03", "10:00")!;
    const r = planSends({ ...base, method: "now", reminders: ["d3", "d1", "d0"] }, startsAt, now);
    expect(r.error).toBeUndefined();
    expect(r.sends.map((s) => s.label)).toEqual(["즉시 발송", "1일 전 오전 9시", "당일 오전 8시"]);
    expect(r.sends[1].at.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(r.sends[2].at.toISOString()).toBe("2026-11-02T23:00:00.000Z");
    expect(r.skipped[0]).toContain("3일 전");
  });
  it("과거 시각 예약은 거부", () => {
    const r = planSends({ ...base, method: "schedule", reminders: [], scheduleDate: "2026-11-01", scheduleTime: "11:00" }, null, now);
    expect(r.error).toBeTruthy();
  });
});

describe("전화번호·암호화", () => {
  it("여러 형식을 정규화한다", () => {
    expect(normalizeMobile("010-1234-5678")).toBe("01012345678");
    expect(normalizeMobile("+82 10 1234 5678")).toBe("01012345678");
    expect(normalizeMobile("02-123-4567")).toBeNull();
    expect(normalizeMobile("010-123")).toBeNull();
  });
  it("암호화 후 복호화하면 원래 값, 같은 번호는 같은 해시", () => {
    const e = encrypt("01012345678");
    expect(e).not.toContain("01012345678");
    expect(decrypt(e)).toBe("01012345678");
    expect(phoneHash("01012345678")).toBe(phoneHash("01012345678"));
    expect(encrypt("01012345678")).not.toBe(e); // 무작위 IV
  });
});

describe("동·호수 생성", () => {
  it("층·세대 수로 호수를 만든다", () => {
    expect(generateUnitNumbers(1, 2, 2).map((u) => u.unitNo)).toEqual(["101", "102", "201", "202"]);
    expect(generateUnitNumbers(12, 12, 1)[0].unitNo).toBe("1201");
  });
  it("직접 입력 목록과 범위를 해석한다", () => {
    expect(parseUnitList("101, 102\n201~203 301호")).toEqual(["101", "102", "201", "202", "203", "301"]);
  });
});

describe("일괄 등록 파일 해석", () => {
  it("엑셀이 저장한 CP949 CSV를 읽는다", async () => {
    const csv = "동,호수,전화번호,이름,수신동의\n101동,301,010-0000-1111,홍길동,예\n";
    const rows = await parseImportFile("a.csv", iconv.encode(csv, "cp949"));
    expect(rows).toEqual([{ building: "101동", unit: "301", phone: "010-0000-1111", name: "홍길동", consent: "예", basis: "" }]);
  });
  it("xlsx를 읽는다", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("s");
    ws.addRow(["동", "호", "휴대폰", "수신 동의"]);
    ws.addRow([101, 1203, "01000002222", "N"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const rows = await parseImportFile("a.xlsx", buf);
    expect(rows).toEqual([{ building: "101", unit: "1203", phone: "01000002222", name: "", consent: "N", basis: "" }]);
  });
  it("필수 열이 없으면 이유를 알려준다", async () => {
    const r = await parseImportFile("a.csv", Buffer.from("이름,번호\n홍,1\n"));
    expect(typeof r).toBe("string");
  });
  it("수신동의 값을 해석한다", () => {
    expect(parseConsent("예")).toBe("agreed");
    expect(parseConsent("N")).toBe("refused");
    expect(parseConsent("")).toBe("pending");
    expect(parseConsent("글쎄")).toBeNull();
  });
});

describe("AI 지어내기 감지", () => {
  it("메모에 없는 숫자를 찾아낸다", () => {
    const today = kstToDate("2026-10-30", "09:00")!;
    expect(inventedNumbers("내일 101동 엘리베이터 오전 10시부터 오후 12시까지 점검", "10월 31일 101동 오전 10시~오후 12시 점검", today)).toEqual([]);
    expect(inventedNumbers("101동 단수", "101동 단수, 오후 5시 복구 예정", today)).toEqual(["5"]);
  });
});
