import { fmtSchedule } from "./time";

export type Category = {
  id: string;
  label: string;
  icon: string;
  title: string; // 기본 제목(날짜는 자동 앞붙임)
  body: string; // 기본 안내 문구
};

export const CATEGORIES: Category[] = [
  {
    id: "elevator",
    label: "엘리베이터 점검",
    icon: "🛗",
    title: "엘리베이터 정기 점검 안내",
    body: "점검 시간 동안 엘리베이터 이용이 제한될 예정입니다.\n입주민 여러분의 양해 부탁드립니다.",
  },
  {
    id: "water_tank",
    label: "물탱크 청소",
    icon: "🚰",
    title: "물탱크 청소에 따른 단수 안내",
    body: "해당 시간 동안 수돗물 공급이 중단될 예정이오니 생활용수를 미리 준비해 주시기 바랍니다.",
  },
  {
    id: "water_outage",
    label: "단수 안내",
    icon: "💧",
    title: "단수 안내",
    body: "해당 시간 동안 수돗물 공급이 중단될 예정입니다.\n생활용수를 미리 준비해 주시기 바랍니다.",
  },
  {
    id: "power_outage",
    label: "정전 안내",
    icon: "💡",
    title: "정전 안내",
    body: "해당 시간 동안 전기 공급이 중단될 예정입니다.\n엘리베이터 이용이 제한되며, 냉장고 등 전자제품 사용에 유의해 주시기 바랍니다.",
  },
  {
    id: "fire",
    label: "소방 점검",
    icon: "🧯",
    title: "소방시설 점검 안내",
    body: "점검 중 화재경보가 울릴 수 있으니 놀라지 마시기 바랍니다.\n세대 내 점검이 필요한 경우 협조 부탁드립니다.",
  },
  {
    id: "parking",
    label: "지하주차장 청소",
    icon: "🚗",
    title: "지하주차장 청소 안내",
    body: "청소 시간 전까지 차량을 지상 또는 다른 구역으로 이동해 주시기 바랍니다.",
  },
  {
    id: "facility",
    label: "시설 점검",
    icon: "🔧",
    title: "시설 점검 안내",
    body: "점검 시간 동안 일부 시설 이용이 제한될 수 있습니다.\n입주민 여러분의 양해 부탁드립니다.",
  },
  {
    id: "amenity",
    label: "공동시설 이용 안내",
    icon: "🏢",
    title: "공동시설 이용 안내",
    body: "",
  },
  {
    id: "emergency",
    label: "긴급 공지",
    icon: "🚨",
    title: "긴급 안내",
    body: "복구 일정은 확인되는 대로 다시 안내드리겠습니다.",
  },
  { id: "etc", label: "기타 안내", icon: "📢", title: "안내", body: "" },
];

export function categoryOf(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

export type SmsTextInput = {
  apartmentName: string;
  officePhone: string;
  isEmergency: boolean;
  title: string;
  body: string;
  startsAt: Date | null;
  endsAt: Date | null;
  targetLabel: string;
};

/** 공지 항목으로 문자 본문을 만든다(관리자가 이후 자유롭게 수정 가능) */
export function buildSmsText(i: SmsTextInput): string {
  const head = i.isEmergency ? `[${i.apartmentName} 긴급안내]` : `[${i.apartmentName} 관리사무소]`;
  const lines: string[] = [head, "", i.title.trim()];
  const sch = fmtSchedule(i.startsAt, i.endsAt);
  const info: string[] = [];
  if (sch) {
    info.push(`일시: ${sch.date}`);
    if (sch.time) info.push(`시간: ${sch.time}`);
  }
  if (i.targetLabel) info.push(`대상: ${i.targetLabel}`);
  if (info.length) lines.push("", ...info);
  if (i.body.trim()) lines.push("", i.body.trim());
  lines.push("", `문의: 관리사무소${i.officePhone ? ` ${i.officePhone}` : ""}`);
  return lines.join("\n");
}
