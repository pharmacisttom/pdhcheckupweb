"use client";
import { useState } from "react";
import { request } from "@/lib/client";
import { closeLoading, showError, showLoading, showSuccess } from "@/lib/alerts";

type Guest = { verified: boolean; otpRequired: boolean };

/**
 * Reclaim a saved registration from another phone/browser.
 * Never persists identity, OTP or clinical data in client storage.
 */
export function RecoverRegistration({ onRecovered }: { onRecovered: () => void }) {
  const [open, setOpen] = useState(false);
  const [registrationId, setRegistrationId] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [phone, setPhone] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [otpDisabled, setOtpDisabled] = useState(false);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    showLoading("กำลังตรวจสอบรายการ");
    try {
      await fn();
    } catch {
      setError("ไม่สามารถยืนยันรายการได้ กรุณาตรวจสอบข้อมูลหรือติดต่อเจ้าหน้าที่");
      await showError("ไม่สามารถยืนยันรายการได้ กรุณาตรวจสอบข้อมูลหรือติดต่อเจ้าหน้าที่");
    } finally {
      closeLoading();
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 16, marginBottom: 16 }}>
      <button
        type="button"
        className="button secondary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        มีข้อมูลลงทะเบียนเดิม? เรียกคืนจากมือถือเครื่องอื่น
      </button>
      {open && (
        <div className="stack" style={{ marginTop: 16 }}>
          <p>
            ใช้รหัสลงทะเบียนเดิม วันเกิด และรหัส OTP ที่ส่งไปยังเบอร์ที่ลงทะเบียน
            ข้อมูลที่บันทึกไว้ยังไม่ถือเป็นนัดหมายที่ยืนยันแล้ว
          </p>
          {error && <p className="alert error" role="alert">{error}</p>}
          {otpDisabled && (
            <p role="status" className="alert">
              ระบบยังไม่ได้เปิดบริการ OTP โปรดติดต่อเจ้าหน้าที่ให้ตรวจสอบรายการเดิม
              ระบบจะไม่ลบข้อมูลที่บันทึกไว้
            </p>
          )}
          <label className="field">
            รหัสลงทะเบียนที่บันทึกไว้
            <input
              value={registrationId}
              onChange={(e) => setRegistrationId(e.target.value.trim())}
              required
              minLength={10}
              maxLength={100}
              autoComplete="off"
            />
          </label>
          <label className="field">
            วันเกิด (ค.ศ.)
            <input
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              required
            />
          </label>
          <label className="field">
            เบอร์มือถือที่ลงทะเบียน
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setVerificationId("");
              }}
              required
              maxLength={20}
            />
          </label>
          {!verificationId ? (
            <button
              type="button"
              className="button"
              disabled={busy || !registrationId || !birthdate || !phone || otpDisabled}
              onClick={() => void run(async () => {
                const guest = await request<Guest>("auth/guest", {});
                if (!guest.otpRequired) {
                  setOtpDisabled(true);
                  setError("บริการ OTP ยังไม่เปิดใช้งาน");
                  return;
                }
                const result = await request<{ verificationId: string }>(
                  "otp/request",
                  { phone },
                );
                setVerificationId(result.verificationId);
              })}
            >
              ขอรหัส OTP เพื่อเรียกคืนข้อมูล
            </button>
          ) : (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await request("otp/verify", { verificationId, code });
                  await request("registrations/recover", {
                    registrationId,
                    birthdate,
                  });
                  await showSuccess("เรียกคืนข้อมูลลงทะเบียนสำเร็จ");
                  onRecovered();
                });
              }}
            >
              <label className="field">
                รหัส OTP 6 หลัก
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="button" disabled={busy || code.length !== 6}>
                ยืนยันและเปิดข้อมูลเดิม
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => { setVerificationId(""); setCode(""); }}
                disabled={busy}
              >
                ขอรหัสใหม่
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
