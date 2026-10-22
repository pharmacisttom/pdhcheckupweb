"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { request } from "@/lib/client";
import { ErrorState } from "./ui";
export function Login() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-container">
      <section className="card">
        <span className="icon-box">
          <LockKeyhole />
        </span>
        <h1 style={{ marginTop: 15 }}>เข้าสู่ระบบเจ้าหน้าที่</h1>
        <p>สำหรับบุคลากรที่ได้รับสิทธิ์จากโรงพยาบาล</p>
        {error && <ErrorState message={error} />}
        <form
          method="post"
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const form = new FormData(e.currentTarget);
            try {
              await request("auth/login", Object.fromEntries(form));
              router.replace("/admin/dashboard");
              router.refresh();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            อีเมล
            <input
              name="email"
              disabled={!ready || busy}
              type="email"
              autoComplete="username"
              required
              maxLength={191}
            />
          </label>
          <label className="field">
            รหัสผ่าน
            <input
              name="password"
              disabled={!ready || busy}
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          <label className="field">
            รหัส MFA (หากตั้งค่าไว้)
            <input
              name="mfa"
              disabled={!ready || busy}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
            />
          </label>
          <button className="button" disabled={busy || !ready}>
            {busy ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
          </button>
        </form>
        <p style={{ fontSize: 11, margin: "20px 0 0" }}>
          ไม่มีบัญชีเริ่มต้นในระบบ
          ต้องสร้างโดยผู้ดูแลพร้อมกำหนดสิทธิ์ก่อนเข้าใช้งาน
        </p>
      </section>
    </div>
  );
}
