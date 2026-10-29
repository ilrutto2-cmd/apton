# 아파트온 — 자체 서버(클라우드 VM 등) 배포용 이미지
FROM node:22-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3000 SCHEDULER=internal
EXPOSE 3000
# 시작할 때 데이터베이스 테이블을 최신으로 맞춘 뒤 서버 실행(예약 발송 실행기 포함)
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && npx next start -p ${PORT}"]
