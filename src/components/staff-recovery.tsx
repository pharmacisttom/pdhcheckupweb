"use client";
import { useEffect, useState } from "react";
import { request } from "@/lib/client";
import { ErrorState } from "./ui";
export function RecoveryCodesView({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  return (
    <section className="card">
      <h1>บันทึกรหัสกู้คืน MFA</h1>
      <p>
        แสดงเพียงครั้งเดียว เก็บในที่ปลอดภัยแยกจากอุปกรณ์ Authenticator
        รหัสแต่ละรายการใช้ได้ครั้งเดียวพร้อมรหัสผ่าน ห้ามส่งให้ผู้อื่น
      </p>
      <ul className="recovery-code-list" aria-label="รหัสกู้คืน MFA">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      <button className="button" onClick={onDone}>
        บันทึกรหัสแล้ว ดำเนินการต่อ
      </button>
    </section>
  );
}
export function StaffRecovery({
  mode,
}: {
  mode: "forgot" | "reset" | "codes";
}) {
  const [token, setToken] = useState(""),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [codes, setCodes] = useState<string[]>([]);
  useEffect(() => {
    const raw = location.hash.slice(1);
    if (raw) {
      history.replaceState(null, "", location.pathname);
      setToken(raw);
    }
    setReady(true);
    const hide = () => {
      setToken("");
      setCodes([]);
    };
    window.addEventListener("pagehide", hide);
    return () => window.removeEventListener("pagehide", hide);
  }, []);
  if (codes.length)
    return (
      <div className="login-container">
        <RecoveryCodesView
          codes={codes}
          onDone={() => {
            setCodes([]);
            location.replace("/admin/change-password");
          }}
        />
      </div>
    );
  return (
    <div className="login-container">
      <section className="card">
        <h1>
          {mode === "forgot"
            ? "ขอรีเซ็ตรหัสผ่านเจ้าหน้าที่"
            : mode === "reset"
              ? "ตั้งรหัสผ่านใหม่"
              : "สร้างรหัสกู้คืน MFA ชุดใหม่"}
        </h1>
        <p>
          {mode === "forgot"
            ? "คำตอบจะเหมือนกันทุกอีเมล หากไม่ได้รับลิงก์กรุณาติดต่อผู้ดูแล"
            : mode === "reset"
              ? "ลิงก์มีอายุ 30 นาที ใช้ได้ครั้งเดียว การรีเซ็ตนี้ไม่ปิดหรือข้าม MFA"
              : "ต้องใช้รหัสผ่านและ Authenticator ของคุณ รหัสกู้คืนชุดเดิมจะใช้ไม่ได้"}
        </p>
        {error && <ErrorState message={error} />}{" "}
        {notice && <p role="status">{notice}</p>}
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const form = e.currentTarget;
            const v = Object.fromEntries(new FormData(form));
            try {
              const result = await request<{
                message?: string;
                recoveryCodes?: string[];
              }>(
                mode === "forgot"
                  ? "auth/forgot-password"
                  : mode === "reset"
                    ? "auth/reset-password"
                    : "auth/mfa/recovery-codes",
                { ...v, ...(mode === "reset" ? { token } : {}) },
              );
              form.reset();
              if (mode === "reset") {
                setToken("");
                setNotice("เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบพร้อม MFA");
              } else if (mode === "codes") setCodes(result.recoveryCodes ?? []);
              else setNotice(result.message ?? "รับคำขอแล้ว");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === "forgot" ? (
            <label className="field">
              อีเมลเจ้าหน้าที่
              <input
                type="email"
                name="email"
                autoComplete="username"
                maxLength={191}
                required
              />
            </label>
          ) : mode === "reset" ? (
            <>
              <label className="field">
                รหัสผ่านใหม่
                <input
                  type="password"
                  name="newPassword"
                  minLength={14}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="field">
                ยืนยันรหัสผ่านใหม่
                <input
                  type="password"
                  name="confirmPassword"
                  maxLength={128}
                  autoComplete="new-password"
                  required
                />
              </label>
            </>
          ) : (
            <>
              <label className="field">
                รหัสผ่านปัจจุบัน
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label className="field">
                รหัส MFA 6 หลัก
                <input
                  name="mfa"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  autoComplete="one-time-code"
                  required
                />
              </label>
            </>
          )}
          <button
            className="button"
            disabled={!ready || busy || (mode === "reset" && !token)}
          >
            {busy ? "กำลังดำเนินการ…" : "ยืนยันดำเนินการ"}
          </button>
        </form>
        <p>
          <a href="/login">กลับเข้าสู่ระบบ</a>
        </p>
      </section>
    </div>
  );
}
