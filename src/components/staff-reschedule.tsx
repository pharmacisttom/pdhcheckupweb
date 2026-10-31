"use client";
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { request, dateTime } from "@/lib/client";
export function StaffReschedule({
  id,
  reference,
  onSaved,
}: {
  id: string;
  reference: string;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [from, setFrom] = useState(() =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
        new Date(Date.now() + 86400000),
      ),
    ),
    [slots, setSlots] = useState<
      { id: string; startsAt: string; available: number }[]
    >([]),
    [loading, setLoading] = useState(false);
  const retry = useRef<{ body: string; key: string } | null>(null);
  useEffect(() => {
    if (!open || !from) return;
    let disposed = false;
    setLoading(true);
    setError("");
    request<typeof slots>(
      "admin/bookings/" + id + "/availability?from=" + encodeURIComponent(from),
    )
      .then((v) => {
        if (!disposed) setSlots(v);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [open, from, id]);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!busy) setOpen(value);
      }}
    >
      <Dialog.Trigger asChild>
        <button className="button secondary small">เลื่อนนัด</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <Dialog.Title>เลื่อนนัด {reference}</Dialog.Title>
          <Dialog.Description>
            ใช้กับนัดที่ยืนยันและล่วงหน้าอย่างน้อย 24 ชั่วโมง
            ต้องบันทึกการตกลงวันเวลาใหม่ ระบบตรวจความจุอีกครั้ง
          </Dialog.Description>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                data = {
                  slotId: String(f.get("slotId")),
                  reason: String(f.get("reason")),
                  patientAgreed: f.has("patientAgreed"),
                },
                body = JSON.stringify(data);
              if (retry.current?.body !== body)
                retry.current = { body, key: crypto.randomUUID() };
              setBusy(true);
              setError("");
              try {
                await request("admin/bookings/" + id + "/reschedule", {
                  ...data,
                  idempotencyKey: retry.current.key,
                });
                setOpen(false);
                retry.current = null;
                await onSaved();
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              เริ่มค้นหาวันว่าง
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </label>
            <label className="field">
              ช่วงเวลาใหม่
              <select
                aria-label="ช่วงเวลาใหม่"
                name="slotId"
                required
                disabled={busy || loading}
              >
                {slots
                  .filter((s) => s.available > 0)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {dateTime(s.startsAt)} · เหลือ {s.available}
                    </option>
                  ))}
              </select>
            </label>
            {!loading && !slots.some((s) => s.available > 0) && (
              <p>ไม่พบช่วงเวลาว่างใน 31 วันจากวันที่เลือก</p>
            )}
            <div className="field">
              <label htmlFor={"reschedule-" + id}>
                เหตุผล / หลักฐานการตกลงวันเวลาใหม่
              </label>
              <textarea
                id={"reschedule-" + id}
                name="reason"
                minLength={3}
                maxLength={500}
                required
              />
            </div>
            <label className="check-label">
              <input name="patientAgreed" type="checkbox" required />
              ผู้รับบริการตกลงวันเวลาใหม่แล้ว
            </label>
            <button
              className="button"
              disabled={busy || loading || !slots.some((s) => s.available > 0)}
            >
              ยืนยันเลื่อนนัด
            </button>
          </form>
          <Dialog.Close className="button secondary" disabled={busy}>
            ปิด
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
