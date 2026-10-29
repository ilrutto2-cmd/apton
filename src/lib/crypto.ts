import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("DATA_ENCRYPTION_KEY는 base64로 인코딩된 32바이트여야 합니다.");
  return buf;
}

/** AES-256-GCM 암호화. 결과: v1.<iv>.<tag>.<cipher> (base64url) */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, enc] = payload.split(".");
  if (v !== "v1") throw new Error("알 수 없는 암호문 형식");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64url")), decipher.final()]).toString("utf8");
}

/** 중복 검사용 결정적 해시 (키가 없으면 역산 불가) */
export function phoneHash(normalizedPhone: string): string {
  return createHmac("sha256", key()).update("phone:" + normalizedPhone).digest("hex");
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
