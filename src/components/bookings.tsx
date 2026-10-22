"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { request, money, dateTime } from "@/lib/client";
import { EmptyState, ErrorState, Loading, PageHeader, StatusBadge } from "./ui";
type Booking = {
  id: string;
  reference: string;
  status: string;
  startsAt: string;
  total: string;
  checkInToken: string;
  snapshot: { lines: { name: string; amount: string }[] };
};
export function Bookings() {
  const [list, setList] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<
    { id: string; reference: string; status: string; createdAt: string }[]
  >([]);
  const [qr, setQr] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState("");
  const [slots, setSlots] = useState<
    { id: string; startsAt: string; available: number }[]
  >([]);
  const [targetSlot, setTargetSlot] = useState("");
  const [busy, setBusy] = useState(false);
  async function startReschedule(id: string) {
    setError("");
    try {
      setSlots(await request("slots"));
      setEditing(id);
      setTargetSlot("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function reschedule() {
    setBusy(true);
    setError("");
    try {
      await request("bookings/" + editing + "/reschedule", {
        slotId: targetSlot,
        idempotencyKey: crypto.randomUUID(),
      });
      setEditing("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    try {
      const bookings = await request<Booking[]>("bookings");
      setList(bookings);
      setContacts(await request("contact-requests"));
      const images = await Promise.all(
        bookings.map(async (b) => [
          b.id,
          await QRCode.toDataURL("PDH-CHECKIN:" + b.checkInToken, {
            margin: 1,
            width: 180,
          }),
        ]),
      );
      setQr(Object.fromEntries(images));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function cancel(b: Booking) {
    const reason = window.prompt("ระบุเหตุผลการยกเลิกนัดหมาย");
    if (!reason) return;
    try {
      await request("bookings/" + b.id + "/cancel", { reason });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="container prose" style={{ maxWidth: 1000 }}>
      <PageHeader
        eyebrow="MY APPOINTMENTS"
        title="นัดหมายของฉัน"
        description="แสดงรายการของเซสชันที่ยืนยันตัวตนนี้เท่านั้น"
      />
      {error && <ErrorState message={error} />} {!list && !error && <Loading />}
      {editing && (
        <section className="card" style={{ marginBottom: 20 }}>
          <h2>เลือกวันและเวลาใหม่</h2>
          <label className="field">
            ช่วงเวลาที่เปิดรับจอง
            <select
              value={targetSlot}
              onChange={(e) => setTargetSlot(e.target.value)}
            >
              <option value="">เลือกช่วงเวลา</option>
              {slots
                .filter((s) => s.available)
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    {dateTime(s.startsAt)} · ว่าง {s.available} ที่
                  </option>
                ))}
            </select>
          </label>
          <p>
            ราคาและรายการตรวจอ้างอิงใบประมาณการเดิม
            เลื่อนนัดได้ล่วงหน้าอย่างน้อย 24 ชั่วโมง
          </p>
          <div className="actions">
            <button
              className="button small"
              disabled={!targetSlot || busy}
              onClick={reschedule}
            >
              ยืนยันเลื่อนนัด
            </button>
            <button
              className="button secondary small"
              onClick={() => setEditing("")}
            >
              ปิด
            </button>
          </div>
        </section>
      )}
      {contacts.map((c) => (
        <article className="card" key={c.id}>
          <h2>{c.reference}</h2>
          <p>
            คำขอให้เจ้าหน้าที่ติดต่อนัด ·{" "}
            {
              (
                {
                  pending: "รอติดต่อ",
                  contacted: "ติดต่อแล้ว",
                  scheduled: "เจ้าหน้าที่บันทึกว่านัดรับบริการแล้ว",
                  closed: "ปิดรายการ",
                } as Record<string, string>
              )[c.status]
            }
          </p>
          <p>
            ส่งข้อมูลเมื่อ {dateTime(c.createdAt)}{" "}
            โปรดยืนยันวันและเวลากับเจ้าหน้าที่ รายการนี้ไม่ใช่ใบนัดออนไลน์
          </p>
        </article>
      ))}
      {list?.length === 0 && contacts.length === 0 && (
        <EmptyState>
          ยังไม่มีนัดหมายในเซสชันนี้ หากลงทะเบียนจากอุปกรณ์อื่น
          ให้ติดต่อโรงพยาบาลเพื่อยืนยันตัวตนและค้นหานัดหมาย
        </EmptyState>
      )}
      {list?.map((b) => (
        <article className="card booking-card" key={b.id}>
          {qr[b.id] && (
            <img
              src={qr[b.id]}
              alt="QR สำหรับเจ้าหน้าที่เช็กอิน ไม่มีข้อมูลสุขภาพในรหัส"
              width={150}
              height={150}
            />
          )}
          <div className="booking-details">
            <StatusBadge status={b.status} />
            <h2 style={{ marginTop: 10 }}>{b.reference}</h2>
            <p>{dateTime(b.startsAt)}</p>
            {b.snapshot.lines.map((l, i) => (
              <div className="summary-line" key={i}>
                <span>{l.name}</span>
                <span>{money(l.amount)}</span>
              </div>
            ))}
            <strong>รวมประมาณการ {money(b.total)}</strong>
            <p style={{ fontSize: 11 }}>
              แสดง QR ให้เจ้าหน้าที่ในวันรับบริการ
              และนำเอกสารที่จำเป็นตามข้อกำหนดโรงพยาบาล
            </p>
            <div className="actions">
              <button
                className="button secondary small"
                onClick={() => window.print()}
              >
                พิมพ์ใบนัดหมาย
              </button>
              {b.status === "confirmed" && (
                <button
                  className="button secondary small"
                  onClick={() => startReschedule(b.id)}
                >
                  เลื่อนนัด
                </button>
              )}
              {b.status === "confirmed" && (
                <button
                  className="button secondary small"
                  onClick={() => cancel(b)}
                >
                  ยกเลิกนัด
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
      <div className="alert">
        การค้นหานัดจากอุปกรณ์อื่น ต้องติดต่อเจ้าหน้าที่และยืนยันตัวตน
        ไม่สามารถเข้าถึงข้อมูลส่วนตัวด้วยเลขอ้างอิงเพียงอย่างเดียว
      </div>
    </div>
  );
}
