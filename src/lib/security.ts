import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "./db";
import type { Session, User, Prisma } from "@prisma/client";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const token = () => randomBytes(32).toString("hex");
function key() {
  const k = process.env.DATA_ENCRYPTION_KEY;
  if (!k || !/^[a-f0-9]{64}$/i.test(k))
    throw new AppError(503, "ยังไม่ได้ตั้งค่ากุญแจเข้ารหัส", "NOT_CONFIGURED");
  return Buffer.from(k, "hex");
}
export function encrypt(data: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), body]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function decrypt<T>(s: string): T {
  const [iv, tag, data] = s.split(".").map((p) => Buffer.from(p, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8"),
  ) as T;
}
export function privateHash(s: string) {
  const pepper = process.env.OTP_PEPPER;
  if (!pepper || pepper.length < 32)
    throw new AppError(503, "ยังไม่ได้ตั้งค่าความปลอดภัย", "NOT_CONFIGURED");
  return createHmac("sha256", pepper).update(s).digest("hex");
}
export function equalHash(a: string, b: string) {
  return (
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export type Identity = Session & { user: User | null };
export async function identitySession(
  required = true,
): Promise<Identity | null> {
  const value = (await cookies()).get("pdh_session")?.value;
  const s = value
    ? await db.session.findUnique({
        where: { tokenHash: hash(value) },
        include: { user: true },
      })
    : null;
  if (!s || s.expiresAt <= new Date() || (s.userId && !s.user?.active)) {
    if (required)
      throw new AppError(401, "กรุณายืนยันตัวตน", "UNAUTHENTICATED");
    return null;
  }
  return s;
}
export async function session(required = true): Promise<Identity | null> {
  const s = await identitySession(false);
  if (
    !s ||
    s.stage !== "full" ||
    (s.userId &&
      (!s.user?.mfaSecret ||
        s.user.activationRequired ||
        s.user.mustChangePassword))
  ) {
    if (required)
      throw new AppError(401, "กรุณายืนยันตัวตนให้ครบถ้วน", "UNAUTHENTICATED");
    return null;
  }
  return s;
}
export async function createSession(
  userId?: string,
  store: Prisma.TransactionClient = db,
  stage: "full" | "password" | "mfa" = "full",
) {
  const raw = token();
  const s = await store.session.create({
    data: {
      tokenHash: hash(raw),
      userId,
      stage,
      expiresAt: new Date(
        Date.now() + (stage === "full" ? (userId ? 8 : 2) * 3600000 : 600000),
      ),
    },
  });
  (await cookies()).set("pdh_session", raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: stage === "full" ? (userId ? 28800 : 7200) : 600,
  });
  return s;
}
const permissions: Record<string, string[]> = {
  registration: [
    "dashboard:read",
    "bookings:read",
    "bookings:write",
    "checkin:write",
    "chat:read",
    "chat:reply",
    "chat:knowledge.write",
  ],
  manager: [
    "users:manage",
    "chat:read",
    "chat:reply",
    "chat:assign",
    "chat:settings",
    "chat:settings.read",
    "chat:reports",
    "chat:knowledge.write",
    "chat:knowledge.review",
    "chat:knowledge.publish",
    "dashboard:read",
    "bookings:read",
    "bookings:write",
    "packages:write",
    "calendar:write",
    "reports:read",
    "organizations:write",
  ],
  laboratory: ["catalog:write", "imports:write", "chat:read", "chat:reply"],
  finance: [
    "dashboard:read",
    "imports:approve",
    "finance:read",
    "chat:read",
    "chat:reply",
    "reports:read",
  ],
  clinician: [
    "questionnaire:write",
    "clinical:read",
    "packages:approve",
    "chat:read",
    "chat:reply",
    "chat:knowledge.write",
    "chat:knowledge.review",
    "chat:clinical.review",
  ],
  dpo: ["privacy:read", "audit:read", "chat:privacy", "chat:settings.read"],
  auditor: ["audit:read", "reports:read", "chat:reports"],
  coordinator: ["organization:own"],
  superadmin: ["*"],
};
export function permitted(role: string, permission: string) {
  return permissions[role]?.some((p) => p === "*" || p === permission) ?? false;
}
export async function guard(permission: string) {
  const s = await session();
  if (!s?.user || !permitted(s.user.role, permission))
    throw new AppError(403, "คุณไม่มีสิทธิ์ดำเนินการนี้", "FORBIDDEN");
  return s;
}
export async function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL;
  if (!expected || origin !== new URL(expected).origin)
    throw new AppError(403, "คำขอไม่ผ่านการตรวจสอบ Origin", "CSRF");
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    await tx.rateLimit.upsert({
      where: { key },
      create: {
        key,
        count: 0,
        expiresAt: new Date(now.getTime() + seconds * 1000),
      },
      update: {},
    });
    await tx.$queryRaw`SELECT \`key\` FROM RateLimit WHERE \`key\` = ${key} FOR UPDATE`;
    const row = await tx.rateLimit.findUniqueOrThrow({ where: { key } });
    const count = row.expiresAt <= now ? 1 : row.count + 1;
    await tx.rateLimit.update({
      where: { key },
      data: {
        count,
        ...(row.expiresAt <= now
          ? { expiresAt: new Date(now.getTime() + seconds * 1000) }
          : {}),
      },
    });
    return count;
  });
  if (result > limit)
    throw new AppError(429, "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่", "RATE_LIMITED");
}
export async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  resourceId: string,
  metadata: Prisma.InputJsonValue = {},
  correlationId?: string,
) {
  await tx.audit.create({
    data: {
      actorId,
      action,
      resourceId,
      metadata,
      correlationId:
        correlationId ??
        (await headers()).get("x-request-id")?.slice(0, 100) ??
        crypto.randomUUID(),
    },
  });
}
