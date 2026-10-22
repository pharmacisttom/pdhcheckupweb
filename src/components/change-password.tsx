"use client";
import { useEffect, useState } from "react";
import { request } from "@/lib/client";
import { ErrorState, PageHeader } from "./ui";

export function ChangePassword() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <>
      <PageHeader
        title="เปลี่ยนรหัสผ่าน"
        description="เปลี่ยนรหัสผ่านของบัญชีที่กำลังเข้าสู่ระบบ"
      />
      {error && <ErrorState message={error} />}
      <section className="card" style={{ maxWidth: 560 }}>
        {done ? (
          <div role="status">
            <h2>เปลี่ยนรหัสผ่านสำเร็จ</h2>
            <p>ออกจากระบบทุกอุปกรณ์แล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่</p>
            <a href="/login" className="button">
              เข้าสู่ระบบใหม่
            </a>
          </div>
        ) : (
          <form
            method="post"
            inert={!ready}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fields = new FormData(form);
              const currentPassword = String(fields.get("currentPassword"));
              const newPassword = String(fields.get("newPassword"));
              const confirmPassword = String(fields.get("confirmPassword"));
              setError("");
              if (newPassword !== confirmPassword) {
                setError("ยืนยันรหัสผ่านใหม่ไม่ตรงกัน");
                return;
              }
              setBusy(true);
              try {
                await request("auth/change-password", {
                  currentPassword,
                  newPassword,
                  confirmPassword,
                });
                form.reset();
                setDone(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              รหัสผ่านเดิม
              <input
                type="password"
                name="currentPassword"
                disabled={!ready || busy}
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <label className="field">
              รหัสผ่านใหม่
              <input
                type="password"
                name="newPassword"
                disabled={!ready || busy}
                autoComplete="new-password"
                required
                minLength={14}
                maxLength={72}
              />
            </label>
            <p>
              อย่างน้อย 14 ตัวอักษร และไม่เกิน 72 ไบต์
              (ภาษาไทยใช้หลายไบต์ต่อตัวอักษร) ใช้รหัสผ่านที่แตกต่างจากเดิม
            </p>
            <label className="field">
              ยืนยันรหัสผ่านใหม่
              <input
                type="password"
                name="confirmPassword"
                disabled={!ready || busy}
                autoComplete="new-password"
                required
                minLength={14}
                maxLength={72}
              />
            </label>
            <p>
              เมื่อเปลี่ยนสำเร็จ ระบบจะออกจากระบบทุกอุปกรณ์ รวมถึงอุปกรณ์นี้
            </p>
            <button className="button" disabled={busy || !ready}>
              {busy ? "กำลังบันทึก…" : "เปลี่ยนรหัสผ่าน"}
            </button>
          </form>
        )}
      </section>
    </>
  );
}
