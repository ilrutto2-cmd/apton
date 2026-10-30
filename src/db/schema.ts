import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** 아파트(단지). 모든 업무 데이터는 apartment_id로 분리된다. */
export const apartments = pgTable("apartments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** 입주민 공지 페이지 주소용 추측 불가능한 식별자 */
  publicSlug: text("public_slug").notNull().unique(),
  address: text("address").notNull().default(""),
  officePhone: text("office_phone").notNull().default(""),
  /** test: 실제 발송·과금 없음 / live: 실제 문자 발송 */
  smsMode: text("sms_mode").notNull().default("test"),
  /** 문자 서비스에 사전 등록된 발신번호 */
  senderNumber: text("sender_number").notNull().default(""),
  /** 건당 요금(원, VAT 별도). 계약 단가에 맞게 설정에서 변경 */
  rateSms: numeric("rate_sms", { precision: 10, scale: 2 }).notNull(),
  rateLms: numeric("rate_lms", { precision: 10, scale: 2 }).notNull(),
  rateSource: text("rate_source").notNull().default(""),
  rateUpdatedAt: timestamp("rate_updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** 하루 최대 발송 건수(무단 대량 발송 방지) */
  dailySendLimit: integer("daily_send_limit").notNull().default(3000),
  includeLinkDefault: boolean("include_link_default").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const admins = pgTable(
  "admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apartmentId: uuid("apartment_id")
      .notNull()
      .references(() => apartments.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** owner: 관리 책임자(계정·설정 관리) / staff: 일반 직원 */
    role: text("role").notNull().default("staff"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("admins_email_uq").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** 쿠키 토큰의 SHA-256 해시. 원문 토큰은 DB에 저장하지 않는다. */
    tokenHash: text("token_hash").primaryKey(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_admin_idx").on(t.adminId)],
);

export const buildings = pgTable(
  "buildings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apartmentId: uuid("apartment_id")
      .notNull()
      .references(() => apartments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("buildings_apt_name_uq").on(t.apartmentId, t.name)],
);

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apartmentId: uuid("apartment_id")
      .notNull()
      .references(() => apartments.id, { onDelete: "cascade" }),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    unitNo: text("unit_no").notNull(),
    floor: integer("floor"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("units_building_no_uq").on(t.buildingId, t.unitNo),
    index("units_apt_idx").on(t.apartmentId),
  ],
);

/**
 * 문자 수신 연락처. 전화번호는 AES-256-GCM 암호문으로 저장하고,
 * 중복 검사는 HMAC 해시로 한다. 화면에는 뒷자리만 노출한다.
 */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apartmentId: uuid("apartment_id")
      .notNull()
      .references(() => apartments.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    phoneEnc: text("phone_enc").notNull(),
    phoneHash: text("phone_hash").notNull(),
    phoneLast4: text("phone_last4").notNull(),
    /** agreed: 수신 동의 확인 / pending: 확인 전 / refused: 거부 / withdrawn: 동의 철회 */
    consentStatus: text("consent_status").notNull().default("pending"),
    consentBasis: text("consent_basis").notNull().default(""),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    inactiveReason: text("inactive_reason"),
    /** 아파트아이 등 다른 아파트 앱으로 공지를 받는 세대 — '다른 앱 사용 세대 제외' 공지에서 빠짐 */
    usesOtherApp: boolean("uses_other_app").notNull().default(false),
    /** 샘플(체험용) 데이터 표시. 실제 발송 대상에서 항상 제외 */
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("contacts_unit_phone_uq").on(t.unitId, t.phoneHash),
    index("contacts_apt_idx").on(t.apartmentId),
    index("contacts_apt_phone_idx").on(t.apartmentId, t.phoneHash),
  ],
);

export type NoticeTarget =
  | { type: "all" }
  | { type: "buildings"; buildingIds: string[] }
  | { type: "units"; unitIds: string[] };

export const notices = pgTable(
  "notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apartmentId: uuid("apartment_id")
      .notNull()
      .references(() => apartments.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    target: jsonb("target").$type<NoticeTarget>().notNull(),
    targetLabel: text("target_label").notNull(),
    /** public: 입주민 공지 페이지에 공개 / private: 수신 세대만 개별 링크로 열람 */
    visibility: text("visibility").notNull().default("public"),
    isEmergency: boolean("is_emergency").notNull().default(false),
    includeLink: boolean("include_link").notNull().default(false),
    /** 다른 아파트 앱을 쓰는 세대는 빼고 보내기(긴급 공지는 항상 전체) */
    excludeAppUsers: boolean("exclude_app_users").notNull().default(false),
    /** 문자 본문(링크 제외). 관리자가 최종 확인한 내용 */
    smsText: text("sms_text").notNull(),
    smsTextEdited: boolean("sms_text_edited").notNull().default(false),
    /** draft / scheduled / sending / sent / partial / failed / canceled */
    status: text("status").notNull().default("draft"),
    /** 작성 화면마다 하나씩 발급되는 요청 키 — 버튼 연타·재전송 시 공지가 두 번 생기지 않게 함 */
    requestKey: text("request_key"),
    createdBy: uuid("created_by").references(() => admins.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("notices_apt_idx").on(t.apartmentId, t.createdAt),
    uniqueIndex("notices_request_key_uq").on(t.requestKey),
  ],
);

/** 공지 1건에 대한 발송 회차(즉시 1회 또는 예약·재안내 여러 회) */
export const dispatches = pgTable(
  "dispatches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apartmentId: uuid("apartment_id")
      .notNull()
      .references(() => apartments.id, { onDelete: "cascade" }),
    noticeId: uuid("notice_id")
      .notNull()
      .references(() => notices.id, { onDelete: "cascade" }),
    /** immediate / scheduled / reminder / resend */
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    /** scheduled / sending / done / canceled / failed */
    status: text("status").notNull().default("scheduled"),
    /** 발송 당시 모드 스냅샷: test / live */
    mode: text("mode").notNull(),
    /** 같은 요청이 두 번 들어와도 회차가 하나만 생기도록 하는 키 */
    idempotencyKey: text("idempotency_key").notNull(),
    /** 재발송일 때 특정 연락처만 대상으로 할 경우 */
    onlyPhoneHashes: jsonb("only_phone_hashes").$type<string[] | null>(),
    textPrefix: text("text_prefix").notNull().default(""),
    messageType: text("message_type"),
    rateSnapshot: numeric("rate_snapshot", { precision: 10, scale: 2 }),
    recipientCount: integer("recipient_count"),
    estimatedCost: numeric("estimated_cost", { precision: 12, scale: 2 }),
    error: text("error"),
    createdBy: uuid("created_by").references(() => admins.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("dispatches_idem_uq").on(t.idempotencyKey),
    index("dispatches_due_idx").on(t.status, t.scheduledAt),
    index("dispatches_notice_idx").on(t.noticeId),
  ],
);

/** 수신자별 발송 기록. (회차, 전화번호) 조합은 유일 → 같은 회차 중복 발송 차단 */
export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apartmentId: uuid("apartment_id")
      .notNull()
      .references(() => apartments.id, { onDelete: "cascade" }),
    dispatchId: uuid("dispatch_id")
      .notNull()
      .references(() => dispatches.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    unitLabel: text("unit_label").notNull(),
    phoneEnc: text("phone_enc").notNull(),
    phoneHash: text("phone_hash").notNull(),
    phoneLast4: text("phone_last4").notNull(),
    /** pending / sending / requested / processing / success / failed / unknown */
    status: text("status").notNull().default("pending"),
    providerMessageId: text("provider_message_id"),
    statusCode: text("status_code"),
    statusMessage: text("status_message"),
    messageType: text("message_type"),
    cost: numeric("cost", { precision: 10, scale: 2 }),
    /** 비공개 공지 열람용 개인 링크 토큰 */
    viewToken: text("view_token"),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("deliveries_dispatch_phone_uq").on(t.dispatchId, t.phoneHash),
    uniqueIndex("deliveries_view_token_uq").on(t.viewToken),
    index("deliveries_status_idx").on(t.status),
    index("deliveries_apt_idx").on(t.apartmentId, t.createdAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apartmentId: uuid("apartment_id").references(() => apartments.id, { onDelete: "cascade" }),
    adminId: uuid("admin_id").references(() => admins.id, { onDelete: "set null" }),
    adminName: text("admin_name"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_apt_idx").on(t.apartmentId, t.createdAt)],
);

export type Apartment = typeof apartments.$inferSelect;
export type Admin = typeof admins.$inferSelect;
export type Building = typeof buildings.$inferSelect;
export type Unit = typeof units.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Notice = typeof notices.$inferSelect;
export type Dispatch = typeof dispatches.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
