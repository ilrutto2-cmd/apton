import { and, asc, eq, gte, inArray, isNotNull, lt, or, sql as dsql } from "drizzle-orm";
import { db, sql } from "@/db";
import { apartments, deliveries, dispatches, notices, type Dispatch } from "@/db/schema";
import { decrypt, randomToken } from "./crypto";
import { detectType, LMS_MAX_BYTES, LMS_SUBJECT_MAX_BYTES, smsBytes, truncateBytes, withLink } from "./sms/message";
import { MockProvider } from "./sms/mock";
import { mapStatusCode, type OutMessage, type SmsProvider } from "./sms/provider";
import { rateFor } from "./sms/pricing";
import { SolapiProvider } from "./sms/solapi";
import { resolveRecipients } from "./targeting";
import { startOfKstDay } from "./time";
import { purgeOldDeliveryPhones } from "./retention";

// ───────── 문자 서비스 선택 ─────────

let override: { test?: SmsProvider; live?: SmsProvider } = {};
/** 자동화 테스트에서 가짜 발송기를 끼워 넣을 때만 사용 */
export function setProviderOverride(o: { test?: SmsProvider; live?: SmsProvider }) {
  override = o;
}

export function liveConfigured(): boolean {
  return !!(override.live || (process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET));
}

export function getProvider(mode: string): SmsProvider | null {
  if (mode === "live") return override.live ?? SolapiProvider.fromEnv();
  return override.test ?? new MockProvider();
}

// ───────── 링크 ─────────

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
export function publicNoticeUrl(slug: string, noticeId: string) {
  return `${appUrl()}/n/${slug}/${noticeId}`;
}
export function privateNoticeUrl(token: string) {
  return `${appUrl()}/p/${token}`;
}
/** 미리보기용 개인 링크(실제 토큰과 길이가 같음) */
export const SAMPLE_TOKEN = "x".repeat(22);

/** 실제 발송될 문자(링크 포함)를 만든다. 미리보기와 발송이 같은 함수를 쓴다. */
export function finalText(opts: {
  prefix: string;
  smsText: string;
  includeLink: boolean;
  visibility: string;
  slug: string;
  noticeId: string;
  viewToken?: string | null;
}): string {
  const body = (opts.prefix ? opts.prefix + "\n" : "") + opts.smsText;
  if (!opts.includeLink) return body;
  const url =
    opts.visibility === "private"
      ? privateNoticeUrl(opts.viewToken ?? SAMPLE_TOKEN)
      : publicNoticeUrl(opts.slug, opts.noticeId);
  return withLink(body, url);
}

// ───────── 예약 처리 진입점 ─────────

/** 실행 시각이 된 예약 회차를 가져와 처리. 여러 서버가 동시에 실행해도 한 회차는 한 곳에서만 처리됨 */
export async function processDueDispatches(limit = 10): Promise<{ claimed: number }> {
  const claimed = await sql<{ id: string }[]>`
    UPDATE dispatches SET status = 'sending', started_at = now()
    WHERE id IN (
      SELECT id FROM dispatches
      WHERE status = 'scheduled' AND scheduled_at <= now()
      ORDER BY scheduled_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  for (const { id } of claimed) {
    await runClaimedDispatch(id).catch(async (e) => {
      console.error("[dispatch] 실패", id, e);
      await failDispatch(id, `처리 중 오류: ${(e as Error).message}`);
    });
  }
  return { claimed: claimed.length };
}

/** 즉시 발송: 방금 만든 회차를 바로 처리(이미 다른 곳에서 가져갔다면 아무것도 안 함) */
export async function runDispatchNow(dispatchId: string): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    UPDATE dispatches SET status = 'sending', started_at = now()
    WHERE id = ${dispatchId} AND status = 'scheduled'
    RETURNING id`;
  if (!rows.length) return false;
  try {
    await runClaimedDispatch(dispatchId);
  } catch (e) {
    console.error("[dispatch] 실패", dispatchId, e);
    await failDispatch(dispatchId, `처리 중 오류: ${(e as Error).message}`);
  }
  return true;
}

async function failDispatch(id: string, error: string) {
  await db
    .update(dispatches)
    .set({ status: "failed", error, finishedAt: new Date() })
    .where(eq(dispatches.id, id));
  // 아직 보내지 않은 건은 '발송 실패'(보내지 않았음이 확실)로 정리
  await db
    .update(deliveries)
    .set({ status: "failed", statusMessage: error, cost: "0", updatedAt: new Date() })
    .where(and(eq(deliveries.dispatchId, id), eq(deliveries.status, "pending")));
  const [d] = await db.select().from(dispatches).where(eq(dispatches.id, id));
  if (d) await recomputeNoticeStatus(d.noticeId);
}

// ───────── 회차 처리 ─────────

async function runClaimedDispatch(dispatchId: string) {
  const [d] = await db.select().from(dispatches).where(eq(dispatches.id, dispatchId));
  if (!d) return;
  const [notice] = await db.select().from(notices).where(eq(notices.id, d.noticeId));
  const [apt] = await db.select().from(apartments).where(eq(apartments.id, d.apartmentId));
  if (!notice || !apt) return failDispatch(d.id, "공지 또는 아파트 정보를 찾을 수 없습니다.");

  const provider = getProvider(d.mode);
  if (!provider) return failDispatch(d.id, "실제 발송 설정(SOLAPI API 키)이 없어 발송하지 않았습니다.");
  if (d.mode === "live" && !apt.senderNumber) return failDispatch(d.id, "발신번호가 설정되지 않아 발송하지 않았습니다.");

  // 1) 수신자 확정(처음 처리할 때 한 번만). 발송 시점 기준으로 다시 고르므로 그사이 전출·동의 철회가 반영됨
  const existing = await db.select({ n: dsql<number>`count(*)::int` }).from(deliveries).where(eq(deliveries.dispatchId, d.id));
  if (existing[0].n === 0) {
    const summary = await resolveRecipients(apt.id, notice.target, {
      includeSample: d.mode === "test",
      onlyPhoneHashes: d.onlyPhoneHashes,
    });
    if (!summary.recipients.length) return failDispatch(d.id, "발송 시점에 문자를 받을 수 있는 수신자가 없습니다.");

    // 하루 발송 한도(무단·실수 대량 발송 방지)
    const [today] = await db
      .select({ n: dsql<number>`count(*)::int` })
      .from(deliveries)
      .innerJoin(dispatches, eq(deliveries.dispatchId, dispatches.id))
      .where(and(eq(deliveries.apartmentId, apt.id), eq(dispatches.mode, d.mode), gte(deliveries.createdAt, startOfKstDay())));
    if (today.n + summary.recipients.length > apt.dailySendLimit) {
      return failDispatch(
        d.id,
        `하루 발송 한도(${apt.dailySendLimit.toLocaleString()}건)를 넘어 발송하지 않았습니다. 오늘 ${today.n}건 발송, 이번 ${summary.recipients.length}건. 설정에서 한도를 조정할 수 있습니다.`,
      );
    }

    const isPrivateLink = notice.includeLink && notice.visibility === "private";
    const sample = finalText({ prefix: d.textPrefix, smsText: notice.smsText, includeLink: notice.includeLink, visibility: notice.visibility, slug: apt.publicSlug, noticeId: notice.id });
    if (smsBytes(sample) > LMS_MAX_BYTES) return failDispatch(d.id, `문자 길이가 ${LMS_MAX_BYTES}바이트를 넘습니다.`);
    const type = detectType(sample);
    const rate = rateFor(apt, type);

    await db
      .insert(deliveries)
      .values(
        summary.recipients.map((r) => ({
          apartmentId: apt.id,
          dispatchId: d.id,
          contactId: r.contactId,
          unitLabel: r.unitLabel,
          phoneEnc: r.phoneEnc,
          phoneHash: r.phoneHash,
          phoneLast4: r.phoneLast4,
          status: "pending",
          messageType: type,
          viewToken: isPrivateLink ? randomToken(16) : null, // 16바이트 → 22자, SAMPLE_TOKEN과 길이 같음
        })),
      )
      .onConflictDoNothing();
    await db
      .update(dispatches)
      .set({
        recipientCount: summary.recipients.length,
        messageType: type,
        rateSnapshot: String(rate),
        estimatedCost: String(rate * summary.recipients.length),
      })
      .where(eq(dispatches.id, d.id));
  }
  const [fresh] = await db.select().from(dispatches).where(eq(dispatches.id, d.id));
  await sendPending(fresh, provider, {
    from: apt.senderNumber || "00000000",
    smsText: notice.smsText,
    title: notice.title,
    includeLink: notice.includeLink,
    visibility: notice.visibility,
    slug: apt.publicSlug,
    noticeId: notice.id,
  });
}

async function sendPending(
  d: Dispatch,
  provider: SmsProvider,
  n: { from: string; smsText: string; title: string; includeLink: boolean; visibility: string; slug: string; noticeId: string },
) {
  const rate = Number(d.rateSnapshot ?? 0);
  const type = (d.messageType ?? "LMS") as "SMS" | "LMS";
  for (;;) {
    // 보낼 묶음을 '요청 중'으로 먼저 표시한 뒤 보낸다 → 서버가 중간에 멈춰도 같은 건을 다시 보내지 않음
    const batch = await sql<{ id: string; phone_enc: string; view_token: string | null }[]>`
      UPDATE deliveries SET status = 'sending', updated_at = now()
      WHERE id IN (
        SELECT id FROM deliveries WHERE dispatch_id = ${d.id} AND status = 'pending'
        ORDER BY created_at LIMIT ${provider.batchSize} FOR UPDATE SKIP LOCKED
      )
      RETURNING id, phone_enc, view_token`;
    if (!batch.length) break;

    const subject = type === "LMS" ? truncateBytes(n.title, LMS_SUBJECT_MAX_BYTES) : undefined;
    const msgs: OutMessage[] = batch.map((b) => ({
      ref: b.id,
      to: decrypt(b.phone_enc),
      from: n.from,
      type,
      subject,
      text: finalText({ prefix: d.textPrefix, smsText: n.smsText, includeLink: n.includeLink, visibility: n.visibility, slug: n.slug, noticeId: n.noticeId, viewToken: b.view_token }),
    }));

    const res = await provider.send(msgs);
    const now = new Date();
    if (res.kind === "ok") {
      for (const r of res.results) {
        const st = r.accepted ? mapStatusCode(r.statusCode) : r.statusCode ? "failed" : "unknown";
        await db
          .update(deliveries)
          .set({
            status: st,
            providerMessageId: r.messageId ?? null,
            statusCode: r.statusCode || null,
            statusMessage: r.statusMessage,
            requestedAt: now,
            cost: st === "failed" ? "0" : String(rate),
            updatedAt: now,
          })
          .where(eq(deliveries.id, r.ref));
      }
    } else if (res.kind === "rejected") {
      // 요청 자체가 거부됨 → 이 묶음과 남은 건 모두 보내지 않은 것이 확실
      const ids = batch.map((b) => b.id);
      await db
        .update(deliveries)
        .set({ status: "failed", statusMessage: `문자 서비스 거부: ${res.error}`, cost: "0", updatedAt: now })
        .where(inArray(deliveries.id, ids));
      await db
        .update(deliveries)
        .set({ status: "failed", statusMessage: "앞선 요청이 거부되어 보내지 않음", cost: "0", updatedAt: now })
        .where(and(eq(deliveries.dispatchId, d.id), eq(deliveries.status, "pending")));
      await db.update(dispatches).set({ error: `문자 서비스 거부: ${res.error}` }).where(eq(dispatches.id, d.id));
      break;
    } else {
      // 응답을 못 받음 → 실제로 나갔을 수도 있으므로 자동 재시도하지 않는다(중복 발송 방지)
      const ids = batch.map((b) => b.id);
      await db
        .update(deliveries)
        .set({ status: "unknown", statusMessage: `접수 여부 확인 불가: ${res.error}`, requestedAt: now, cost: String(rate), updatedAt: now })
        .where(inArray(deliveries.id, ids));
      await db
        .update(deliveries)
        .set({ status: "failed", statusMessage: "앞선 요청의 응답이 없어 보내지 않음(재발송 가능)", cost: "0", updatedAt: now })
        .where(and(eq(deliveries.dispatchId, d.id), eq(deliveries.status, "pending")));
      await db.update(dispatches).set({ error: res.error }).where(eq(dispatches.id, d.id));
      break;
    }
  }
  await finalizeDispatch(d.id);
}

async function finalizeDispatch(id: string) {
  const counts = await deliveryCounts([id]);
  const c = counts.get(id);
  const total = c ? Object.values(c).reduce((a, b) => a + b, 0) : 0;
  const failed = c?.failed ?? 0;
  await db
    .update(dispatches)
    .set({ status: total > 0 && failed === total ? "failed" : "done", finishedAt: new Date() })
    .where(and(eq(dispatches.id, id), eq(dispatches.status, "sending")));
  const [d] = await db.select().from(dispatches).where(eq(dispatches.id, id));
  if (d) await recomputeNoticeStatus(d.noticeId);
}

// ───────── 결과 확인(폴링) ─────────

const RESULT_TIMEOUT_HOURS = 72;

/** 접수됐지만 최종 결과가 아직 없는 건의 상태를 문자 서비스에 물어본다 */
export async function pollResults(limit = 500): Promise<{ checked: number; updated: number }> {
  const cutoff = new Date(Date.now() - 20_000);
  const rows = await db
    .select({ id: deliveries.id, msgId: deliveries.providerMessageId, requestedAt: deliveries.requestedAt, mode: dispatches.mode, dispatchId: deliveries.dispatchId, rate: dispatches.rateSnapshot })
    .from(deliveries)
    .innerJoin(dispatches, eq(deliveries.dispatchId, dispatches.id))
    .where(
      and(
        inArray(deliveries.status, ["requested", "processing"]),
        isNotNull(deliveries.providerMessageId),
        or(dsql`${deliveries.lastCheckedAt} IS NULL`, lt(deliveries.lastCheckedAt, cutoff)),
      ),
    )
    .orderBy(asc(deliveries.lastCheckedAt))
    .limit(limit);
  let updated = 0;
  const touchedDispatches = new Set<string>();
  for (const mode of ["test", "live"]) {
    const group = rows.filter((r) => r.mode === mode);
    if (!group.length) continue;
    const provider = getProvider(mode);
    if (!provider) continue;
    let statuses;
    try {
      statuses = await provider.status(group.map((g) => g.msgId!));
    } catch (e) {
      console.error("[poll] 결과 조회 실패", e);
      continue;
    }
    const now = new Date();
    for (const g of group) {
      const s = statuses.get(g.msgId!);
      let status: string | null = null;
      let code: string | null = null;
      let msg: string | null = null;
      if (s) {
        status = mapStatusCode(s.statusCode);
        code = s.statusCode;
        msg = s.statusMessage;
      }
      const expired = g.requestedAt && now.getTime() - g.requestedAt.getTime() > RESULT_TIMEOUT_HOURS * 3600000;
      if ((!status || status === "requested" || status === "processing") && expired) {
        status = "unknown";
        msg = `${RESULT_TIMEOUT_HOURS}시간 안에 최종 결과를 받지 못함`;
      }
      const set: Record<string, unknown> = { lastCheckedAt: now, updatedAt: now };
      if (status) {
        set.status = status;
        if (code) set.statusCode = code;
        if (msg) set.statusMessage = msg;
        if (status === "failed") set.cost = "0";
        updated++;
        touchedDispatches.add(g.dispatchId);
      }
      await db.update(deliveries).set(set).where(eq(deliveries.id, g.id));
    }
  }
  if (touchedDispatches.size) {
    const ds = await db.select({ noticeId: dispatches.noticeId }).from(dispatches).where(inArray(dispatches.id, [...touchedDispatches]));
    for (const n of new Set(ds.map((x) => x.noticeId))) await recomputeNoticeStatus(n);
  }
  return { checked: rows.length, updated };
}

/** 서버가 발송 도중 멈춰 '요청 중'에 남은 건 → 실제로 나갔는지 알 수 없으므로 '결과 확인 불가'로 정리 */
export async function recoverStuck(): Promise<number> {
  const stale = new Date(Date.now() - 10 * 60000);
  const rows = await db
    .update(deliveries)
    .set({ status: "unknown", statusMessage: "발송 중 서버 중단 — 접수 여부 확인 불가", updatedAt: new Date() })
    .where(and(eq(deliveries.status, "sending"), lt(deliveries.updatedAt, stale)))
    .returning({ dispatchId: deliveries.dispatchId });
  const stuckDispatches = await db
    .select({ id: dispatches.id })
    .from(dispatches)
    .where(and(eq(dispatches.status, "sending"), lt(dispatches.startedAt, stale)));
  for (const d of stuckDispatches) {
    // 아직 보내지 않은(pending) 건이 남아 있으면 이어서 보낸다 — 이 건들은 발송된 적이 없음이 확실
    const [p] = await db.select({ n: dsql<number>`count(*)::int` }).from(deliveries).where(and(eq(deliveries.dispatchId, d.id), eq(deliveries.status, "pending")));
    if (p.n > 0) {
      const [full] = await db.select().from(dispatches).where(eq(dispatches.id, d.id));
      const [notice] = await db.select().from(notices).where(eq(notices.id, full.noticeId));
      const [apt] = await db.select().from(apartments).where(eq(apartments.id, full.apartmentId));
      const provider = getProvider(full.mode);
      if (provider && notice && apt) {
        await db.update(dispatches).set({ startedAt: new Date() }).where(eq(dispatches.id, d.id));
        await sendPending(full, provider, { from: apt.senderNumber || "00000000", smsText: notice.smsText, title: notice.title, includeLink: notice.includeLink, visibility: notice.visibility, slug: apt.publicSlug, noticeId: notice.id });
        continue;
      }
    }
    await finalizeDispatch(d.id);
  }
  return rows.length;
}

/** 크론/스케줄러가 주기적으로 부르는 한 번의 작업 */
export async function tick() {
  await purgeOldDeliveryPhones().catch((e) => console.error("[retention]", e));
  const recovered = await recoverStuck();
  const due = await processDueDispatches();
  const poll = await pollResults();
  return { recovered, ...due, ...poll };
}

// ───────── 집계 ─────────

export type StatusCounts = Partial<Record<"pending" | "sending" | "requested" | "processing" | "success" | "failed" | "unknown", number>>;

export async function deliveryCounts(dispatchIds: string[]): Promise<Map<string, StatusCounts>> {
  const out = new Map<string, StatusCounts>();
  if (!dispatchIds.length) return out;
  const rows = await db
    .select({ dispatchId: deliveries.dispatchId, status: deliveries.status, n: dsql<number>`count(*)::int` })
    .from(deliveries)
    .where(inArray(deliveries.dispatchId, dispatchIds))
    .groupBy(deliveries.dispatchId, deliveries.status);
  for (const r of rows) {
    const m = out.get(r.dispatchId) ?? {};
    m[r.status as keyof StatusCounts] = r.n;
    out.set(r.dispatchId, m);
  }
  return out;
}

export async function recomputeNoticeStatus(noticeId: string) {
  const ds = await db.select().from(dispatches).where(eq(dispatches.noticeId, noticeId));
  if (!ds.length) return;
  let status: string;
  if (ds.every((d) => d.status === "canceled")) status = "canceled";
  else if (ds.some((d) => d.status === "sending")) status = "sending";
  else {
    const finished = ds.filter((d) => d.status === "done" || d.status === "failed");
    if (!finished.length) status = "scheduled";
    else {
      const counts = await deliveryCounts(finished.map((d) => d.id));
      let ok = 0,
        bad = 0;
      for (const c of counts.values()) {
        ok += (c.success ?? 0) + (c.requested ?? 0) + (c.processing ?? 0);
        bad += (c.failed ?? 0) + (c.unknown ?? 0);
      }
      if (ok === 0 && bad > 0) status = "failed";
      else if (bad > 0) status = "partial";
      else if (ok === 0) status = finished.some((d) => d.status === "failed") ? "failed" : "sent";
      else status = "sent";
    }
  }
  await db.update(notices).set({ status, updatedAt: new Date() }).where(eq(notices.id, noticeId));
}
