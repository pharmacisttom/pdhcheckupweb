import nodemailer from "nodemailer";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, AppError } from "@/lib/security";
export type StaffEmailKind =
  | "invitation"
  | "resend"
  | "expired"
  | "activated"
  | "password_reset"
  | "password_changed"
  | "suspended";
export type DeliveryStatus = "sent" | "failed" | "disabled";
export type StaffEmail = {
  to: string;
  name: string;
  kind: StaffEmailKind;
  link?: string;
  note?: string;
  expiresAt?: Date;
  key: string;
};
const headings: Record<StaffEmailKind, string> = {
  invitation: "คำเชิญเข้าใช้งาน PDH Smart Health Check",
  resend: "คำเชิญเข้าใช้งานฉบับใหม่",
  expired: "คำเชิญเข้าใช้งานหมดอายุ",
  activated: "เปิดใช้งานบัญชีแล้ว กรุณาตั้งค่า MFA",
  password_reset: "ตั้งรหัสผ่านใหม่สำหรับบัญชีเจ้าหน้าที่",
  password_changed: "รหัสผ่านบัญชีเจ้าหน้าที่ถูกเปลี่ยนแล้ว",
  suspended: "บัญชีเจ้าหน้าที่ถูกระงับ",
};
export function staffEmailTemplate(m: StaffEmail) {
  const lines = [
    headings[m.kind],
    "เรียน " + m.name,
    "โรงพยาบาลปลวกแดง",
    m.note ?? "",
    m.link ? "เปิดลิงก์เพื่อดำเนินการ: " + m.link : "",
    m.expiresAt ? "ลิงก์หมดอายุ: " + m.expiresAt.toISOString() : "",
    "ระบบจะไม่ขอรหัสผ่านหรือรหัส Authenticator ทางอีเมล",
    "หากไม่ได้ร้องขอ กรุณาติดต่อผู้ดูแลระบบโรงพยาบาล",
  ];
  return { subject: headings[m.kind], text: lines.filter(Boolean).join("\n") };
}
export function staffTokenLink(
  path: "/invite" | "/reset-password",
  raw: string,
) {
  const origin = new URL(process.env.APP_URL ?? "");
  if (
    origin.protocol !== "https:" &&
    (process.env.NODE_ENV === "production" ||
      !["localhost", "127.0.0.1"].includes(origin.hostname))
  )
    throw new AppError(503, "กรุณาตั้งค่า HTTPS origin สำหรับอีเมล");
  const url = new URL(path, origin.origin);
  url.hash = raw;
  return url.toString();
}
export async function sendStaffEmail(m: StaffEmail): Promise<DeliveryStatus> {
  if ((process.env.EMAIL_PROVIDER ?? "disabled") === "disabled")
    return "disabled";
  try {
    const from = z.email().parse(process.env.EMAIL_FROM);
    const to = z.email().parse(m.to);
    if (
      /[\r\n]/.test(from + to) ||
      process.env.EMAIL_SENDER_VERIFIED !== "true"
    )
      return "failed";
    const body = staffEmailTemplate(m);
    if (process.env.EMAIL_PROVIDER === "smtp") {
      const port = Number(process.env.SMTP_PORT ?? 587);
      if (
        !process.env.SMTP_HOST ||
        ![465, 587].includes(port) ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASSWORD
      )
        return "failed";
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        requireTLS: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
        tls: { rejectUnauthorized: true },
        logger: false,
        debug: false,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      try {
        const result = await transport.sendMail({ from, to, ...body });
        return result.accepted?.length && !result.rejected?.length
          ? "sent"
          : "failed";
      } finally {
        transport.close();
      }
    }
    if (process.env.EMAIL_PROVIDER === "resend" && process.env.RESEND_API_KEY) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.RESEND_API_KEY,
          "Content-Type": "application/json",
          "Idempotency-Key": m.key,
        },
        body: JSON.stringify({ from, to: [to], ...body }),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      return response.ok ? "sent" : "failed";
    }
    return "failed";
  } catch {
    return "failed";
  } // Never log provider errors, request bodies, credentials or token links.
}
export async function staffNotice(
  user: { id: string; email: string; name: string },
  kind: StaffEmailKind,
  key: string,
  link?: string,
  expiresAt?: Date,
  auditContext?: { actorId: string; correlationId: string },
) {
  const result = await sendStaffEmail({
    to: user.email,
    name: user.name,
    kind,
    key,
    link,
    expiresAt,
  });
  await db.$transaction((tx) =>
    audit(
      tx,
      auditContext?.actorId ?? "staff-email-service",
      "email." + result,
      user.id,
      { kind },
      auditContext?.correlationId,
    ),
  );
  return result;
}
