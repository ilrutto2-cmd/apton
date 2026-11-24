# 아파트온 (APT ON)

> 관리사무소는 한 번 알리고, 주민은 어디서든 확인한다.

아파트 관리사무소가 웹에서 공지를 작성하면, 선택한 동·호수 입주민의 휴대전화로 **문자(SMS/LMS)** 가 즉시 또는 예약 시각에 발송되는 서비스입니다. 입주민은 앱 설치나 회원가입 없이 문자와 문자 속 링크로 공지를 확인합니다.

- 데모: https://apton.vercel.app
- 관리자: 공지 작성 → 대상(전체/동/호수) 선택 → 미리보기·예상 비용 확인 → 즉시/예약 발송 → 수신자별 결과 확인·실패 건 재발송
- 입주민: 문자 수신, 공개 공지 페이지(`/n/[단지]`), 세대별 개인 링크(`/p/[토큰]`)
- 문자: **SOLAPI** 연동(실제 발송) + **테스트 모드**(API 키 없이 전 과정 검증, 요금 0원)

<p align="center">
  <img src="docs/screenshots/01_대시보드.png" width="48%" />
  <img src="docs/screenshots/02_공지작성.png" width="48%" />
</p>

문서: [사용 설명서](docs/사용설명서.md) · [배포 가이드](docs/배포가이드.md) · [테스트 결과](docs/테스트결과.md)

## 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 웹 | Next.js 15 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 | 화면과 서버 로직을 한 프로젝트로 관리, Vercel·Docker 모두 배포 가능 |
| DB | PostgreSQL (Supabase) · Drizzle ORM | `FOR UPDATE SKIP LOCKED` 행 잠금과 고유 제약으로 중복 발송을 DB 수준에서 차단 |
| 예약 실행 | Supabase **pg_cron + pg_net** → `/api/cron/dispatch` (Vercel) / 서버 내장 30초 실행기 (Docker) | 브라우저를 닫아도 서버가 예약 시각에 발송 |
| 문자 | SOLAPI REST API (HMAC-SHA256 인증) | SMS 18원·LMS 45원(공시가), 결과 조회 API 제공. `SmsProvider` 인터페이스로 다른 업체 추가 가능 |
| 보안 | AES-256-GCM 전화번호 암호화, bcrypt 비밀번호, 감사 로그 | 개인정보 최소 노출(화면엔 뒷자리만) |
| 테스트 | Vitest + 실제 PostgreSQL | 동시성·중복 방지는 진짜 DB에서만 검증 가능 |
| AI (선택) | Anthropic Messages API | 메모 → 공지 초안. 키가 없으면 메뉴만 숨겨짐 |

## 예약 발송 구조

```mermaid
flowchart LR
  A[관리자: 공지 등록<br/>즉시/예약 시각] --> B[(DB 저장<br/>notices · dispatches<br/>scheduled_at)]
  C[pg_cron<br/>매 1분] -- pg_net HTTP 호출<br/>Bearer CRON_SECRET --> D["/api/cron/dispatch<br/>tick()"]
  D --> E[예약 시각 지난 회차 조회<br/>FOR UPDATE SKIP LOCKED]
  B -.-> E
  E --> F[수신자 확정<br/>동의·전출·중복 제거]
  F --> G[SOLAPI 묶음 발송]
  G --> H[(deliveries · audit_logs<br/>발송 이력 기록)]
  D --> I[결과 조회 pollResults<br/>접수 2000 → 수신 4000]
  I --> H
```

1. **공지 등록** — 관리자가 대상과 발송 시각을 정하면 `notices`(공지)와 `dispatches`(발송 회차, `scheduled_at`)로 저장됩니다. 요청 키 고유 제약으로 버튼 연타에도 회차는 하나만 생깁니다.
2. **DB 저장** — 이 시점에는 문자를 보내지 않습니다. 예약은 DB에만 존재하므로 브라우저·서버 재시작과 무관합니다.
3. **pg_cron 조회** — Supabase의 `pg_cron`이 1분마다 `pg_net`으로 `/api/cron/dispatch`를 호출하고, 앱의 `tick()`이 예약 시각이 지난 회차를 `FOR UPDATE SKIP LOCKED`로 집어 옵니다. 크론이 겹쳐 실행돼도 한 회차는 한 곳에서만 처리됩니다.
4. **SOLAPI 발송** — 발송 시점 기준으로 수신자를 다시 계산(동의 철회·전출 제외, 같은 번호 1건)한 뒤, 각 건을 먼저 '요청 중'으로 표시하고 SOLAPI에 묶음 요청합니다.
5. **이력 기록** — 수신자별 결과를 `deliveries`에 기록하고, 이후 주기마다 결과 조회 API로 갱신합니다. 접수(2000)만으로는 성공 처리하지 않고 수신 완료(4000)를 받아야 '발송 성공 확인'이 됩니다. 응답이 없던 건은 중복 방지를 위해 자동 재시도하지 않고 '결과 확인 불가'로 남깁니다.

```sql
-- Supabase SQL Editor (pg_cron, pg_net 확장 활성화 후)
select cron.schedule('apton-dispatch', '* * * * *', $$
  select net.http_get(
    url := 'https://apton.vercel.app/api/cron/dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
  );
$$);
```

### pg_cron으로 전환한 이유

처음에는 웹 서버 프로세스 안에서 30초마다 예약 건을 확인하는 **내장 실행기**(`SCHEDULER=internal`)로 만들었습니다. 서버 한 대(Docker)에서는 잘 동작하지만 Vercel로 옮기면서 문제가 생겼습니다.

- **서버리스에는 상주 프로세스가 없다** — 요청이 없으면 함수가 내려가므로 `setInterval` 기반 타이머가 예약 시각에 깨어 있다는 보장이 없습니다.
- **Vercel 무료 플랜 Cron은 하루 1회** — 분 단위 예약 발송에 쓸 수 없습니다.
- **DB가 이미 Supabase** — 별도 크론 서비스를 추가하지 않고, 항상 떠 있는 DB 쪽 `pg_cron`이 1분마다 엔드포인트를 깨우게 하면 인프라가 늘지 않습니다.
- **중복 실행에 안전한 구조** — 발송 로직이 원래 행 잠금·고유 제약으로 동시 실행을 견디도록 만들어져 있어, 실행 주체를 바꿔도 코드 변경은 `SCHEDULER=off` 설정뿐입니다.

엔드포인트는 `CRON_SECRET` Bearer 토큰(타이밍 공격 방지 비교)으로 보호되며, 헤더 없이 호출하면 401을 반환합니다.

## 테스트

```bash
npm test   # Vitest, 실제 PostgreSQL 테스트 DB 필요 (기본 postgres://apton:apton_dev@localhost:5432/apton_test, TEST_DATABASE_URL로 변경)
```

**4개 파일, 44개 테스트 모두 통과** (2026-11-24, PostgreSQL 17 기준 재실행 확인)

| 파일 | 개수 | 범위 |
|---|---|---|
| `tests/dispatch.test.ts` | 22 | 동·호수 대상 지정, 다른 동/다른 아파트 오발송 없음, 같은 회차 동시 실행(즉시 2번 + 스케줄러 2번)에도 중복 문자 없음, 예약 시각 전 미발송·취소 예약 미발송·발송 시점 전출자 제외, 실패 코드 기록, 접수≠성공, 아파트 간 데이터 분리, 테스트 모드 외부 호출 0회, 수신 동의·하루 한도, 다른 앱 사용 세대 제외(긴급 공지는 포함) |
| `tests/solapi.test.ts` | 5 | 가짜 SOLAPI 서버로 HMAC 서명, `send-many/detail` 요청 본문, 접수/거부 응답 해석, 4xx=거부·5xx/네트워크=알 수 없음, 결과 조회 반영 |
| `tests/privacy.test.ts` | 2 | 1년 지난 발송 기록의 전화번호 파기(뒷자리만 보존), 최근 기록은 유지 |
| `tests/units.test.ts` | 15 | SMS/LMS 바이트 판정, 90바이트 단문 줄이기, 문자 형식, 재안내 시각, 전화번호 정규화, 암호화/복호화, CP949 CSV·xlsx 파싱, AI 초안의 '메모에 없는 숫자' 감지 |

브라우저 시나리오(데스크톱·모바일 32개)는 [테스트 결과](docs/테스트결과.md)에 별도 정리했습니다. 실제 SOLAPI 키로 문자를 보내는 검증은 자동 테스트 범위 밖입니다.

## 빠른 시작

필요: Node.js 20.12+, PostgreSQL 14+

```bash
npm install
cp .env.example .env.local   # DATABASE_URL, DATA_ENCRYPTION_KEY(openssl rand -base64 32), CRON_SECRET 등
npm run db:migrate
npm run db:seed              # (선택) 체험용 아파트 + 010-0000-xxxx 샘플 연락처
npm run dev                  # http://localhost:3000
```

SOLAPI 키를 비워 두면 모든 발송이 테스트 모드로 동작합니다(실제 발송·과금 없음). 시드의 데모 계정은 운영 전에 반드시 삭제·변경하세요.

## 운영 시 고려사항

### 1. 발신번호 사전등록 의무
전기통신사업법(발신번호 변작 방지)에 따라 문자는 **사전에 등록·인증된 번호로만** 보낼 수 있습니다. 관리사무소 대표번호를 SOLAPI 콘솔에 등록하고, 번호 명의(관리주체)가 사용자와 다르면 통신서비스 이용증명원·위임장 등 서류 심사가 필요합니다. 등록 전에는 실제 발송이 불가하므로 도입 일정에 심사 기간을 포함해야 합니다.

### 2. 입주민 번호 수집 시 개인정보 동의
- 전화번호는 개인정보이므로 **수집·이용 목적, 항목, 보유 기간을 고지하고 동의**를 받아야 합니다. 앱은 연락처마다 동의 상태(확인 전/동의/거부)를 두고 **동의한 번호에만 발송**합니다.
- 관리비 고지 등 기존 명부를 그대로 가져오는 경우에도 목적 외 이용이 되지 않도록 별도 동의 절차가 필요합니다.
- 전출 시 즉시 '사용 중지'로 바꾸고 보유 기간이 지나면 파기해야 합니다. 번호는 AES-256-GCM으로 암호화 저장되며, 전체 번호 열람·수정·삭제·발송은 감사 로그에 남습니다. 발송 기록의 번호는 1년이 지나면 자동으로 지우고 뒷자리만 남기며, 개인정보 처리방침·이용약관 페이지와 입주민 페이지의 수신 중단 안내를 갖췄습니다.
- 공지 문자는 정보성 메시지로 보지만, 광고성 내용이 섞이면 정보통신망법상 별도 수신 동의·(광고) 표기 의무가 생깁니다.

### 3. 관리사무소 도입 장벽
- **비용 결재** — 문자비(건당 18~45원)는 관리비에서 나가므로 입주자대표회의 의결·예산 편성이 필요할 수 있습니다. 앱은 발송 전 예상 비용과 월별 비용 화면을 제공합니다.
- **기존 채널과의 경쟁** — 아파트 앱, 방송, 게시판, 단톡방이 이미 있어 "왜 또 하나?"라는 질문을 받습니다. 앱 설치 없이 문자로 고령 입주민까지 닿는다는 점이 핵심 설득 포인트입니다.
- **연락처 초기 구축** — 가장 큰 진입 장벽은 동의받은 번호 명부를 만드는 일입니다. CSV/엑셀 일괄 등록과 양식 다운로드를 지원하지만, 동의서 회수는 오프라인 작업으로 남습니다.
- **디지털 숙련도와 오발송 부담** — 실수 한 번이 전 세대 문자가 되므로, 테스트 모드·미리보기·확인 창·하루 발송 한도로 사고를 막도록 설계했습니다.

## 프로젝트 구조

```
src/
  app/(admin)/       관리자 화면: dashboard, notices, residents, apartment, costs, settings
  app/n/[slug]/      입주민 공개 공지
  app/p/[token]/     세대별 개인 안내 링크
  app/api/cron/      예약 발송·결과 확인 엔드포인트 (CRON_SECRET 보호)
  lib/dispatch.ts    발송 엔진: 회차 확보 → 수신자 확정 → 묶음 발송 → 결과 조회 → 복구
  lib/sms/           SOLAPI·테스트 발송기, 바이트 계산, 요금
  lib/targeting.ts   대상 → 적격 수신자 (동의·중복 제거·아파트 분리)
  db/schema.ts       테이블 정의 (drizzle/에 SQL 마이그레이션)
scripts/             migrate, seed, worker
tests/               자동 테스트 (실제 PostgreSQL)
```
