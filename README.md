# 아파트온 (APT ON)

> 관리사무소는 한 번 알리고, 주민은 어디서든 확인한다.

아파트 관리사무소가 웹에서 공지를 작성하면, 선택한 동·호수의 입주민 휴대전화로 **문자메시지(SMS/LMS)** 가 발송되는 서비스입니다. 입주민은 앱 설치나 회원가입이 필요 없습니다.

- 관리자 웹: 공지 작성 → 대상 선택 → 미리보기·비용 확인 → 발송(즉시/예약/재안내) → 결과 확인
- 입주민: 문자 수신 + (선택) 문자 속 링크로 공지 상세·이전 공지 확인
- 문자 서비스: **SOLAPI** 연동(실제 발송) + **테스트 모드**(API 키 없이 전 과정 검증, 요금 0원)

문서
- [사용 설명서](docs/사용설명서.md) — 관리사무소 직원용
- [배포 가이드](docs/배포가이드.md) — 서버·DB·문자 서비스 연결
- [테스트 결과](docs/테스트결과.md) — 실제로 확인한 항목

## 빠른 시작(내 컴퓨터)

필요: Node.js 20.12 이상, PostgreSQL 14 이상

```bash
npm install
cp .env.example .env.local          # 값 채우기: DATABASE_URL, DATA_ENCRYPTION_KEY(openssl rand -base64 32) 등
npm run db:migrate                  # 테이블 생성
npm run db:seed                     # (선택) 체험용 행복아파트 + 샘플 연락처
npm run build && npm start          # http://localhost:3000
```

샘플 로그인: `demo@apton.kr` / `apton-demo-2026` (실제 운영 전 삭제·변경). 샘플 연락처는 개통되지 않는 `010-0000-xxxx` 번호만 쓰며 실제 발송에서는 항상 제외됩니다.

자동 테스트: `npm test` (별도 DB `apton_test` 사용, `TEST_DATABASE_URL`로 변경 가능)

## 기술 선택

| 영역 | 선택 | 이유 |
|---|---|---|
| 웹 | Next.js 15(App Router) + React 19 + TypeScript + Tailwind CSS 4 | 화면과 서버 기능을 한 프로젝트로, Vercel·일반 서버 모두 배포 가능 |
| DB | PostgreSQL + Drizzle ORM | 행 잠금(`FOR UPDATE SKIP LOCKED`)과 고유 제약으로 중복 발송을 DB 수준에서 차단. Supabase 호환 |
| 문자 | SOLAPI | 국내 SMS 18원·LMS 45원(공시가, VAT 별도), 간단한 HMAC 인증, 결과 조회 API. NHN Cloud도 `SmsProvider` 인터페이스로 추가 가능 |
| 예약 | 서버 내장 실행기(30초) 또는 외부 크론 → `/api/cron/dispatch` | 브라우저와 무관하게 서버가 실행 |
| AI(선택) | Anthropic Messages API | 키가 없어도 나머지 기능은 그대로 동작 |

## 구조

```
src/
  app/(admin)/        관리자 화면: dashboard, notices(작성·상세·내역), residents, apartment, costs, settings
  app/n/[slug]/       입주민 공개 공지 페이지(단지 공지만)
  app/p/[token]/      세대별(비공개) 안내 — 수신자 개인 링크
  app/api/cron/       예약 발송·결과 확인 실행 엔드포인트(비밀값 필요)
  lib/dispatch.ts     발송 엔진: 회차 확보 → 수신자 확정 → 묶음 발송 → 결과 조회 → 복구
  lib/sms/            SOLAPI·테스트 발송기, 바이트 계산, 요금
  lib/targeting.ts    대상 → 적격 수신자(동의·사용 중·중복 제거·아파트 분리)
  db/schema.ts        테이블 정의 (drizzle/ 에 SQL 마이그레이션)
scripts/              migrate, seed, worker(별도 실행기)
tests/                자동 테스트(실제 PostgreSQL 사용)
```

## 발송 상태와 안전장치

| 상태 | 의미 |
|---|---|
| 발송 대기 | 아직 문자 서비스로 보내지 않음 |
| 발송 요청 | 문자 서비스에 요청함/접수됨(코드 2000) |
| 발송 처리 중 | 통신사 전달, 결과 대기(3000) |
| 발송 성공 확인 | 통신사 수신 완료(4000) — **접수만으로는 성공 표시 안 함** |
| 발송 실패 | 거부·통신사 실패(1xxx/2xxx/3xxx). 요금 0원으로 계산, 재발송 가능 |
| 결과 확인 불가 | 응답 없음·서버 중단·72시간 내 결과 없음 — **자동 재시도 안 함** |

- 같은 회차 같은 번호는 DB 고유 제약으로 1번만 기록·발송
- 회차는 원자적 상태 변경으로 한 곳에서만 처리(여러 서버·연타·크론 중복 실행에도 안전)
- 요청 전 '요청 중'으로 먼저 표시 → 중간에 서버가 멈추면 다시 보내지 않고 '결과 확인 불가'로 정리
- 응답이 없는 묶음은 자동 재발송하지 않음(중복 발송 방지). 관리자가 확인 후 수동 재발송
- 수신 동의 확인 + 사용 중 + (실제 발송이면) 샘플 아님 인 번호만 발송, 하루 발송 한도
- 전화번호 AES-256-GCM 암호화, 화면에는 뒷자리만, 전체 열람·수정·삭제·발송은 이력 기록
- 모든 조회·변경은 로그인한 관리자의 아파트 ID로 제한(다른 아파트 데이터 접근 불가)
