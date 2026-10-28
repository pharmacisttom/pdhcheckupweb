"use client";
import { useLanguage } from "@/components/language-provider";
import { useState } from "react";
import { request } from "@/lib/client";
import { ErrorState } from "./ui";
export function RecoverInterest({ onRecovered }: { onRecovered: () => void }) {
  const { t } = useLanguage();

  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [code, setCode] = useState("");
  const [testCode, setTestCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="card">
      <summary>{t("กลับมาติดตามรายการจากอุปกรณ์อื่น / เซสชันหมดอายุ")}</summary>
      <p>
        {t(
          "ต้องยืนยัน OTP ที่เบอร์เดิม พร้อมเลขติดตามและวันเกิด จึงจะเข้าถึงข้อมูลได้",
        )}
      </p>
      {error && <ErrorState message={error} />}
      <label className="field">
        {t("เบอร์โทรที่ลงทะเบียน")}
        <input
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setVerificationId("");
          }}
        />
      </label>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() =>
          run(async () => {
            await request("auth/guest", {});
            const r = await request<{
              verificationId: string;
              testCode?: string;
            }>("otp/request", { phone });
            setVerificationId(r.verificationId);
            setTestCode(r.testCode ?? "");
          })
        }
      >
        {t("ขอรหัส OTP")}
      </button>
      {testCode && (
        <p>
          {t("โหมดทดสอบ:")}
          {testCode}
          {t("— ไม่มีการส่ง SMS จริง")}
        </p>
      )}
      {verificationId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await request("otp/verify", { verificationId, code });
              await request("contact-requests/recover", {
                reference,
                birthdate,
              });
              onRecovered();
            });
          }}
        >
          <label className="field">
            {t("รหัส OTP")}
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label className="field">
            {t("เลขติดตาม")}
            <input
              required
              value={reference}
              maxLength={40}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <label className="field">
            {t("วันเกิด (ค.ศ.)")}
            <input
              type="date"
              required
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
            />
          </label>
          <button className="button" disabled={busy}>
            {t("ยืนยันตัวตนและเรียกดูรายการ")}
          </button>
        </form>
      )}
    </details>
  );
}
