import { AppError, decrypt } from "@/lib/security";
export function otpRequired() {
  return (process.env.OTP_PROVIDER ?? "disabled") !== "disabled";
}
export function assertContactSession(
  identity: { verifiedPhone: string | null; expiresAt: Date } | null,
  phone?: string,
  allowExpired = false,
) {
  if (!identity || (!allowExpired && identity.expiresAt <= new Date()))
    throw new AppError(401, "กรุณาเริ่มเซสชันใหม่", "UNAUTHENTICATED");
  if (!otpRequired()) return;
  if (!identity.verifiedPhone)
    throw new AppError(401, "กรุณายืนยันเบอร์โทรศัพท์");
  if (phone && phone !== decrypt<string>(identity.verifiedPhone))
    throw new AppError(422, "เบอร์โทรศัพท์ไม่ตรงกับเบอร์ที่ยืนยัน");
}
