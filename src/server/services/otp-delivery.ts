import { otpRequired } from "./contact-verification";
import { AppError } from "@/lib/security";
export function otpTestMode() {
  return (
    process.env.OTP_PROVIDER === "test" && process.env.NODE_ENV !== "production"
  );
}
export async function deliverOtp(phone: string, code: string) {
  if (!otpRequired())
    throw new AppError(
      503,
      "ปิดการส่ง OTP กรุณาติดต่อเจ้าหน้าที่เพื่อยืนยันตัวตน",
      "OTP_DISABLED",
    );
  if (otpTestMode()) return;
  if (
    process.env.OTP_PROVIDER !== "http" ||
    !process.env.OTP_HTTP_URL ||
    !process.env.OTP_HTTP_TOKEN
  )
    throw new AppError(
      503,
      "ยังไม่ได้เชื่อมต่อผู้ให้บริการ OTP",
      "PROVIDER_UNCONFIGURED",
    );
  const endpoint = new URL(process.env.OTP_HTTP_URL);
  if (endpoint.protocol !== "https:")
    throw new AppError(
      503,
      "OTP endpoint must use HTTPS",
      "PROVIDER_UNCONFIGURED",
    );
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + process.env.OTP_HTTP_TOKEN,
      },
      body: JSON.stringify({ phone, code, ttlSeconds: 300 }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("delivery failed");
  } catch {
    throw new AppError(
      503,
      "ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่ภายหลัง",
      "OTP_DELIVERY_FAILED",
    );
  }
}
