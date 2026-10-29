"use client";
import { useLanguage } from "@/components/language-provider";
import { useEffect, useState } from "react";
import { RecoverInterest } from "./recover-interest";
import { contactStatuses } from "./booking-control";
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
  const { t, locale } = useLanguage();

  const [otpIsRequired, setOtpIsRequired] = useState(false);
  const [list, setList] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<
    {
      id: string;
      reference: string;
      status: string;
      createdAt: string;
      acceptedAt?: string;
      informationRequest?: string;
      bookingId?: string;
      proposal?: {
        fingerprint: string;
        total: string;
        expiresAt: string;
        snapshot: { lines: { name: string; amount: string }[] };
      };
    }[]
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
      const identity = await request<{ otpRequired: boolean }>(
        "auth/guest",
        {},
      );
      setOtpIsRequired(identity.otpRequired);
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
    const reason = window.prompt(t("ระบุเหตุผลการยกเลิกนัดหมาย"));
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
        title={t("นัดหมายของฉัน")}
        description={t("แสดงเฉพาะรายการที่สร้างในเซสชันนี้")}
      />
      <RecoverInterest
        onRecovered={() => {
          setError("");
          void load();
        }}
      />
      {error && <ErrorState message={error} />} {!list && !error && <Loading />}
      {editing && (
        <section className="card" style={{ marginBottom: 20 }}>
          <h2>{t("เลือกวันและเวลาใหม่")}</h2>
          <label className="field">
            {t("ช่วงเวลาที่เปิดรับจอง")}
            <select
              value={targetSlot}
              onChange={(e) => setTargetSlot(e.target.value)}
            >
              <option value="">{t("เลือกช่วงเวลา")}</option>
              {slots
                .filter((s) => s.available)
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    {dateTime(s.startsAt, locale)}
                    {t("· ว่าง")}
                    {s.available}
                    {t("ที่")}
                  </option>
                ))}
            </select>
          </label>
          <p>
            {t(
              "ราคาและรายการตรวจอ้างอิงใบประมาณการเดิม เลื่อนนัดได้ล่วงหน้าอย่างน้อย 24 ชั่วโมง",
            )}
          </p>
          <div className="actions">
            <button
              className="button small"
              disabled={!targetSlot || busy}
              onClick={reschedule}
            >
              {t("ยืนยันเลื่อนนัด")}
            </button>
            <button
              className="button secondary small"
              onClick={() => setEditing("")}
            >
              {t("ปิด")}
            </button>
          </div>
        </section>
      )}
      {contacts.map((c) => (
        <article className="card" key={c.id}>
          <h2>{c.reference}</h2>
          <p>
            {t("คำขอให้เจ้าหน้าที่ติดต่อนัด ·")} {t(contactStatuses[c.status])}
          </p>
          {c.status === "awaiting_information" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                setBusy(true);
                try {
                  await request("contact-requests/information", {
                    id: c.id,
                    text: form.get("text"),
                  });
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p>{c.informationRequest}</p>
              <label className="field">
                {t("ข้อมูลเพิ่มเติมที่เจ้าหน้าที่ขอ")}
                <textarea name="text" required maxLength={4000} />
              </label>
              <button className="button" disabled={busy}>
                {t("ส่งข้อมูลเพิ่มเติม")}
              </button>
            </form>
          )}
          {c.proposal && c.status === "ready_to_schedule" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  await request("contact-requests/accept", {
                    id: c.id,
                    fingerprint: c.proposal!.fingerprint,
                    slotId: form.get("slotId"),
                  });
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h3>{t("รายการและราคาที่เสนอ")}</h3>
              {c.proposal.snapshot.lines.map((l, i) => (
                <p key={i}>
                  {l.name} · {money(l.amount)}
                </p>
              ))}
              <p>
                {t("รวม")}
                {money(c.proposal.total)}
                {t("· หมดอายุ")}
                {dateTime(c.proposal.expiresAt, locale)}
              </p>
              <label className="field">
                {t("วันและเวลาที่ตกลง")}
                <select
                  name="slotId"
                  required
                  onFocus={() => {
                    request<typeof slots>("contact-requests/slots", {
                      id: c.id,
                    })
                      .then(setSlots)
                      .catch((e) => setError(e.message));
                  }}
                >
                  <option value="">{t("เลือกวันและเวลา")}</option>
                  {slots
                    .filter((s) => s.available)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {dateTime(s.startsAt, locale)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="check-label">
                <input type="checkbox" required />
                {t(
                  "รับทราบรายการ ราคา และวันเวลา โดยเจ้าหน้าที่จะตรวจความจุก่อนยืนยันนัด",
                )}
              </label>
              <button className="button" disabled={busy}>
                {t("รับทราบและตกลงวันเวลา")}
              </button>
              {c.acceptedAt && (
                <p role="status">
                  {t("รับทราบแล้ว รอเจ้าหน้าที่สร้างนัดจริง")}
                </p>
              )}
            </form>
          )}
          <p>
            {t("ส่งข้อมูลเมื่อ")}
            {dateTime(c.createdAt, locale)}{" "}
            {c.bookingId
              ? t("ยืนยันนัดแล้ว ดูเลขนัดและ QR ในใบนัดด้านล่าง")
              : t(
                  "โปรดยืนยันวันและเวลากับเจ้าหน้าที่ รายการนี้ไม่ใช่ใบนัดออนไลน์",
                )}
          </p>
        </article>
      ))}
      {list?.length === 0 && contacts.length === 0 && (
        <EmptyState>
          {t(
            "ยังไม่มีนัดหมายในเซสชันนี้ หากลงทะเบียนจากอุปกรณ์อื่น ให้ติดต่อโรงพยาบาลเพื่อยืนยันตัวตนและค้นหานัดหมาย",
          )}
        </EmptyState>
      )}
      {list?.map((b) => (
        <article className="card booking-card" key={b.id}>
          {qr[b.id] && (
            <img
              src={qr[b.id]}
              alt={t("QR สำหรับเจ้าหน้าที่เช็กอิน ไม่มีข้อมูลสุขภาพในรหัส")}
              width={150}
              height={150}
            />
          )}
          <div className="booking-details">
            <StatusBadge status={b.status} />
            <h2 style={{ marginTop: 10 }}>{b.reference}</h2>
            <p>{dateTime(b.startsAt, locale)}</p>
            {b.snapshot.lines.map((l, i) => (
              <div className="summary-line" key={i}>
                <span>{l.name}</span>
                <span>{money(l.amount)}</span>
              </div>
            ))}
            <strong>
              {t("รวมประมาณการ")}
              {money(b.total)}
            </strong>
            <p style={{ fontSize: 11 }}>
              {t(
                "แสดง QR ให้เจ้าหน้าที่ในวันรับบริการ และนำเอกสารที่จำเป็นตามข้อกำหนดโรงพยาบาล",
              )}
            </p>
            <div className="actions">
              <button
                className="button secondary small"
                onClick={() => window.print()}
              >
                {t("พิมพ์ใบนัดหมาย")}
              </button>
              {b.status === "confirmed" && (
                <button
                  className="button secondary small"
                  onClick={() => startReschedule(b.id)}
                >
                  {t("เลื่อนนัด")}
                </button>
              )}
              {b.status === "confirmed" && (
                <button
                  className="button secondary small"
                  onClick={() => cancel(b)}
                >
                  {t("ยกเลิกนัด")}
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
      {otpIsRequired && (
        <div className="alert">
          {t(
            "กลับมาดูรายการได้ด้วย OTP เลขติดตามหรือเลขนัด และวันเกิด ไม่สามารถใช้เลขอ้างอิงเพียงอย่างเดียว",
          )}
        </div>
      )}
    </div>
  );
}
