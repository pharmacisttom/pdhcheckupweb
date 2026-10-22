"use client";
import { useEffect, useState } from "react";
import { request, dateTime } from "@/lib/client";
import { EmptyState, ErrorState, Loading, PageHeader } from "./ui";

export function BookingControl() {
  const [policy, setPolicy] = useState<{
    onlineEnabled: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    request<typeof policy>("admin/booking-policy")
      .then(setPolicy)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <PageHeader
        title="เปิด–ปิดรับนัดออนไลน์"
        description="ปรับรูปแบบรับนัดได้ทันที โดยนัดหมายเดิมยังคงอยู่"
      />
      {error && <ErrorState message={error} />}{" "}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      {!policy && !error && <Loading />}
      {policy && (
        <section className="card">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              setNotice("");
              try {
                setPolicy(await request("admin/booking-policy", policy));
                setNotice("บันทึกการรับนัดแล้ว");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="check-label">
              <input
                type="checkbox"
                checked={policy.onlineEnabled}
                onChange={(e) =>
                  setPolicy({ ...policy, onlineEnabled: e.target.checked })
                }
              />
              เปิดรับนัดออนไลน์ ให้ผู้ใช้เลือกวันและเวลาเอง
            </label>
            <p>
              {policy.onlineEnabled
                ? "ผู้ใช้เลือกวันเวลา สำรองคิว และยืนยันนัดออนไลน์ได้ตามปฏิทินให้บริการ"
                : "ปิดการเลือกวันเวลาและยืนยันนัดออนไลน์ ผู้ใช้ส่งข้อมูลให้เจ้าหน้าที่ติดต่อนัดแทนได้"}
            </p>
            <label className="field">
              ข้อความแจ้งเมื่อปิดรับนัดออนไลน์
              <textarea
                required
                maxLength={1000}
                rows={4}
                value={policy.message}
                onChange={(e) =>
                  setPolicy({ ...policy, message: e.target.value })
                }
              />
            </label>
            <p>
              การปิดมีผลต่อการจองและเลื่อนนัดออนไลน์ รวมถึงหน้าที่เปิดค้างไว้
              การดูนัดเดิม ยกเลิกนัด และการทำงานของเจ้าหน้าที่ยังใช้งานได้
            </p>
            <button className="button" disabled={busy}>
              {busy ? "กำลังบันทึก…" : "บันทึกรูปแบบรับนัด"}
            </button>
          </form>
        </section>
      )}
    </>
  );
}

type Contact = {
  id: string;
  reference: string;
  status: string;
  note: string;
  createdAt: string;
  details: {
    person: {
      firstName: string;
      lastName: string;
      phone: string;
      email?: string;
      assistance?: string;
    };
    answers: Record<string, unknown>;
    questionnaireVersion: number;
    total: string;
    estimate: { lines: { name: string }[] };
  };
};
export const contactStatuses: Record<string, string> = {
  pending: "รอติดต่อ",
  contacted: "ติดต่อแล้ว",
  scheduled: "นัดรับบริการแล้ว",
  closed: "ปิดรายการ",
};

export function ContactRequests() {
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("pending");
  const load = () =>
    request<Contact[]>("admin/contact-requests")
      .then(setRows)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <PageHeader
        title="คำขอให้ติดต่อนัด"
        description="ติดต่อผู้รับบริการเพื่อตกลงวันเวลา และบันทึกผลการติดต่อ"
      />
      {error && <ErrorState message={error} />} {!rows && !error && <Loading />}
      <label className="field">
        กรองสถานะ
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">ทั้งหมด</option>
          {Object.entries(contactStatuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p>
        แสดงรายการล่าสุดสูงสุด 200 รายการ
        การบันทึกว่านัดแล้วเป็นบันทึกการนัดโดยเจ้าหน้าที่ ไม่ได้จัดสรรคิวออนไลน์
      </p>
      {rows
        ?.filter((r) => !filter || r.status === filter)
        .map((r) => (
          <article className="card" key={r.id} style={{ marginBottom: 20 }}>
            <h2>{r.reference}</h2>
            <p>
              {dateTime(r.createdAt)} · {contactStatuses[r.status]}
            </p>
            <p>
              {r.details.person.firstName} {r.details.person.lastName} ·{" "}
              <a href={"tel:" + r.details.person.phone}>
                {r.details.person.phone}
              </a>{" "}
              {r.details.person.email}
            </p>
            <p>
              {r.details.estimate.lines.map((l) => l.name).join(" · ")} ·
              ประมาณการ {r.details.total} บาท
            </p>
            {r.details.person.assistance && (
              <p>ความช่วยเหลือที่ต้องการ: {r.details.person.assistance}</p>
            )}
            <details>
              <summary>
                ข้อมูลแบบประเมิน เวอร์ชัน {r.details.questionnaireVersion}
              </summary>
              {Object.entries(r.details.answers).map(([key, value]) => (
                <p key={key}>
                  {key}: {String(value)}
                </p>
              ))}
            </details>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  await request("admin/contact-requests/status", {
                    id: r.id,
                    status: f.get("status"),
                    note: f.get("note"),
                  });
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field">
                สถานะการติดต่อ
                <select name="status" defaultValue={r.status}>
                  {Object.entries(contactStatuses).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                บันทึกการติดต่อ / วันเวลานัดที่ตกลง
                <textarea name="note" maxLength={2000} defaultValue={r.note} />
              </label>
              <button className="button small" disabled={busy}>
                บันทึกผลการติดต่อ
              </button>
            </form>
          </article>
        ))}
      {rows && !rows.some((r) => !filter || r.status === filter) && (
        <EmptyState>ไม่มีคำขอในสถานะนี้</EmptyState>
      )}
    </>
  );
}
