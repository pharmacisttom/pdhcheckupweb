"use client";
import { useEffect, useState } from "react";
import { request } from "@/lib/client";
import { RecoveryCodesView } from "./staff-recovery";
import { ErrorState } from "./ui";
function Logout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return (
    <button
      className="button secondary"
      type="button"
      disabled={!ready}
      onClick={async () => {
        await request("auth/logout", {});
        window.location.replace("/login");
      }}
    >
      ออกจากระบบ
    </button>
  );
}
export function EnrollmentForm({ mode }: { mode: "activate" | "password" }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  const [invited, setInvited] = useState<{
    name: string;
    email: string;
    department?: string | null;
  } | null>(null);
  const [activationToken, setActivationToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (mode !== "activate") return;
    const fragment = window.location.hash.slice(1);
    if (fragment) {
      window.history.replaceState(null, "", window.location.pathname);
      queueMicrotask(() => setActivationToken(fragment));
      request<{ name: string; email: string; department?: string | null }>(
        "invitations/verify",
        { token: fragment },
      )
        .then(setInvited)
        .catch((e) => {
          setActivationToken("");
          setError((e as Error).message);
        });
    }
  }, [mode]);
  return (
    <div className="login-container">
      <section className="card">
        <h1>
          {mode === "activate"
            ? "เปิดใช้งานบัญชีเจ้าหน้าที่"
            : "ตั้งรหัสผ่านใหม่ก่อนใช้งาน"}
        </h1>
        <p>
          รหัสผ่านอย่างน้อย 14 ตัวอักษร และไม่เกิน 72 ไบต์ จากนั้นตั้งค่า MFA
          เพื่อเข้าระบบ
        </p>
        {error && <ErrorState message={error} />}
        {invited && (
          <p>
            คำเชิญสำหรับ {invited.name} ({invited.email}) {invited.department}
          </p>
        )}
        {mode === "activate" && !activationToken && (
          <p role="status">
            เปิดหน้านี้จากลิงก์คำเชิญที่ผู้ดูแลมอบให้
            หากคำเชิญหมดอายุให้ขอลิงก์ใหม่
          </p>
        )}
        <form
          className="stack"
          method="post"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            const form = e.currentTarget;
            const values = Object.fromEntries(new FormData(form));
            try {
              const result = await request<{ next: string }>(
                mode === "activate"
                  ? "auth/activate"
                  : "auth/onboarding/password",
                mode === "activate"
                  ? { ...values, token: activationToken }
                  : values,
              );
              setActivationToken("");
              form.reset();
              window.location.replace(result.next);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === "password" && (
            <label className="field">
              รหัสผ่านเดิม
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
                disabled={busy || !ready}
              />
            </label>
          )}
          <label className="field">
            รหัสผ่านใหม่
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={14}
              maxLength={128}
              required
              disabled={busy || !ready}
            />
          </label>
          <label className="field">
            ยืนยันรหัสผ่านใหม่
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              maxLength={128}
              disabled={busy || !ready}
            />
          </label>
          <button
            className="button"
            disabled={
              busy ||
              !ready ||
              (mode === "activate" && (!activationToken || !invited))
            }
          >
            {busy ? "กำลังบันทึก…" : "บันทึกรหัสผ่านและดำเนินการต่อ"}
          </button>
        </form>
        <div style={{ marginTop: 16 }}>
          <Logout />
        </div>
      </section>
    </div>
  );
}
export function MfaSetup() {
  const [recovery, setRecovery] = useState<{
    codes: string[];
    next: string;
  } | null>(null);
  useEffect(() => {
    const hide = () => setRecovery(null);
    window.addEventListener("pagehide", hide);
    return () => window.removeEventListener("pagehide", hide);
  }, []);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  const [setup, setSetup] = useState<{
    manualKey: string;
    qrDataUrl: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!setup) return;
    const timer = setTimeout(
      () => {
        setSetup(null);
        setError("หมดเวลาตั้งค่า กรุณาออกจากระบบและเข้าสู่ระบบใหม่");
      },
      Math.max(0, new Date(setup.expiresAt).getTime() - Date.now()),
    );
    const hide = () => setSetup(null);
    window.addEventListener("pagehide", hide);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", hide);
    };
  }, [setup]);
  if (recovery)
    return (
      <div className="login-container">
        <RecoveryCodesView
          codes={recovery.codes}
          onDone={() => {
            setRecovery(null);
            window.location.replace(recovery.next);
          }}
        />
      </div>
    );
  return (
    <div className="login-container">
      <section className="card">
        <h1>ตั้งค่าการยืนยันตัวตนสองขั้นตอน</h1>
        <p>
          ใช้แอป Authenticator สแกน QR หรือกรอกคีย์ด้วยตนเอง ห้ามส่ง QR
          หรือคีย์ให้ผู้อื่น
        </p>
        {error && <ErrorState message={error} />}
        {!setup && (
          <button
            className="button"
            disabled={busy || !ready}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setSetup(await request("auth/mfa/setup", {}));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            เริ่มตั้งค่า MFA
          </button>
        )}
        {setup && (
          <>
            <img
              className="mfa-qr"
              src={setup.qrDataUrl}
              width={256}
              height={256}
              alt="QR สำหรับตั้งค่า Authenticator ของบัญชีนี้"
            />
            <p>คีย์สำหรับกรอกด้วยตนเอง</p>
            <code className="mfa-key" aria-label="คีย์ MFA">
              {setup.manualKey}
            </code>
            <p>
              บัญชีใน Authenticator ใช้ชื่อ PDH Smart Health Check
              และอีเมลของคุณ
            </p>
            <form
              className="stack"
              method="post"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const form = e.currentTarget;
                const code = String(new FormData(form).get("code"));
                try {
                  const result = await request<{
                    next: string;
                    recoveryCodes: string[];
                  }>("auth/mfa/confirm", { code });
                  setSetup(null);
                  form.reset();
                  setRecovery({
                    codes: result.recoveryCodes,
                    next: result.next,
                  });
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field">
                รหัสยืนยัน 6 หลัก
                <input
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                  disabled={busy || !ready}
                />
              </label>
              <button className="button" disabled={busy || !ready}>
                ยืนยันและเปิดใช้งาน MFA
              </button>
            </form>
          </>
        )}
        <div style={{ marginTop: 20 }}>
          <Logout />
        </div>
      </section>
    </div>
  );
}
