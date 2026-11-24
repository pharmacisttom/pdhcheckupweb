"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { canReviewTransition } from "@/lib/intake";
import { request, dateTime } from "@/lib/client";
import {
  closeLoading,
  showError,
  showLoading,
  showSuccess,
} from "@/lib/alerts";
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
              showLoading("กำลังบันทึกรูปแบบรับนัด");
              try {
                setPolicy(await request("admin/booking-policy", policy));
                setNotice("บันทึกการรับนัดแล้ว");
                void showSuccess("บันทึกรูปแบบรับนัดแล้ว");
              } catch (e) {
                setError((e as Error).message);
                void showError(
                  "บันทึกรูปแบบรับนัดไม่สำเร็จ โปรดตรวจสอบข้อความในหน้า",
                );
              } finally {
                closeLoading();
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
  proposal?: {
    snapshot: { lines: { name: string; amount: string }[] };
    total: string;
    expiresAt: string;
  };
  assignedTo?: string;
  entitlementStatus: string;
  bookingId?: string;
  acceptedAt?: string;
  questions: { id: string; label: string }[];
  review: {
    informationRequest?: string;
    dataReview?: string;
    entitlementReview?: string;
    contacts?: { at: string; actorId: string; note: string }[];
  };
  details: {
    supplements?: { at: string; text: string }[];
    person: import("@/lib/domain").Person;
    answers: Record<string, unknown>;
    questionnaireVersion: number;
    contactVerification?: string;
    interestedPackage?: { id: string; name: string; version: number };
    total?: string;
    estimate?: { lines: { name: string }[] };
  };
};
export const contactStatuses: Record<string, string> = {
  pending: "รอตรวจ (เดิม)",
  contacted: "ติดต่อแล้ว (เดิม)",
  submitted: "รอตรวจ",
  under_review: "กำลังตรวจ",
  awaiting_information: "รอข้อมูลเพิ่ม",
  ready_to_schedule: "พร้อมนัด",
  scheduled: "นัดแล้ว",
  closed: "ปิดเรื่อง",
};
type PendingRegistration = {
  id: string;
  status: "registered_not_booked";
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  questionnaireVersion: number;
};
export function ContactRequests() {
  const [pending, setPending] = useState<PendingRegistration[] | null>(null);
  const [pendingError, setPendingError] = useState("");
  const [pendingDetail, setPendingDetail] = useState<{
    id: string;
    contact: { name: string; phone: string; email: string };
  } | null>(null);
  const [rows, setRows] = useState<
    | Pick<
        Contact,
        | "id"
        | "reference"
        | "status"
        | "createdAt"
        | "assignedTo"
        | "entitlementStatus"
      >[]
    | null
  >(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const [listRevision, setListRevision] = useState(0);
  const [detail, setDetail] = useState<Contact | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [services, setServices] = useState<{ id: string; nameTh: string }[]>(
    [],
  );
  const [packages, setPackages] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const loadPending = () =>
    request<PendingRegistration[]>("admin/registrations/pending")
      .then(setPending)
      .catch((e) => setPendingError((e as Error).message));
  const load = useCallback(async () => {
    setListRevision((v) => v + 1);
  }, []);
  useEffect(() => {
    let active = true;
    request<{ rows: NonNullable<typeof rows>; total: number }>(
      "admin/contact-requests?" +
        new URLSearchParams({
          page: String(page),
          pageSize: "20",
          status: filter,
          search: query,
        }),
    )
      .then((result) => {
        if (active) {
          setRows(result.rows);
          setTotal(result.total);
          setError("");
        }
      })
      .catch((e: Error) => {
        if (active) {
          setRows([]);
          setTotal(0);
          setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [page, filter, query, listRevision]);
  useEffect(() => {
    loadPending();
    request<{ id: string; name: string }[]>("admin/contact-requests/assignees")
      .then(setAssignees)
      .catch((e) => setError(e.message));
    request<{ id: string; nameTh: string }[]>("services")
      .then(setServices)
      .catch((e) => setError(e.message));
    request<{ id: string; name: string }[]>("packages")
      .then(setPackages)
      .catch((e) => setError(e.message));
  }, []);
  async function mutate(path: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      await request(path, data);
      setDetail(null);
      await load();
      void showSuccess("บันทึกคำขอแล้ว");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rights: Record<string, string> = {
    universal: "บัตรทอง",
    social_security: "ประกันสังคม",
    civil_servant: "สวัสดิการข้าราชการ",
    private_insurance: "ประกันเอกชน",
    self_pay: "ชำระเอง",
    other: "อื่น ๆ",
    unknown: "ไม่ทราบ",
  };
  return (
    <>
      <PageHeader
        title="คำขอให้ติดต่อนัด"
        description="ตรวจข้อมูลและสิทธิก่อนนัดจริง การนัดต้องให้ผู้ใช้รับทราบราคาและวันเวลา"
      />
      {error && <ErrorState message={error} />}
      {!rows && !error && <Loading />}
      <section
        className="card"
        aria-label="ลงทะเบียนแล้วแต่ยังไม่จอง"
        style={{ marginBottom: 24 }}
      >
        <h2>ลงทะเบียนแล้ว แต่ยังไม่ส่งคำขอหรือยืนยันการจอง</h2>
        <p>
          ข้อมูลเหล่านี้ถูกบันทึกในระบบแล้ว แต่ยังไม่มีเลขอ้างอิงการจอง
          กรุณาตรวจสอบขั้นตอนถัดไปกับผู้รับบริการ
        </p>
        {pendingError && <ErrorState message={pendingError} />}
        {pending === null && !pendingError && <Loading />}
        {pending !== null && pending.length === 0 && (
          <p role="status">ไม่มีข้อมูลลงทะเบียนที่รอดำเนินการ</p>
        )}
        {pending !== null && pending.length > 0 && (
          <div className="table-wrap">
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>รหัสรายการ (บางส่วน)</th>
                  <th>บันทึกเมื่อ</th>
                  <th>แก้ไขล่าสุด</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td data-label="รหัสรายการ">{r.id.slice(-8)}</td>
                    <td data-label="บันทึกเมื่อ">{dateTime(r.createdAt)}</td>
                    <td data-label="แก้ไขล่าสุด">{dateTime(r.updatedAt)}</td>
                    <td data-label="สถานะ">
                      ลงทะเบียนแล้ว · รอขั้นตอนจอง
                      <button
                        type="button"
                        className="button secondary small"
                        style={{ marginLeft: 8 }}
                        onClick={async () => {
                          setPendingError("");
                          setPendingDetail(null);
                          try {
                            const detail = await request<{
                              id: string;
                              contact: {
                                name: string;
                                phone: string;
                                email: string;
                              };
                            }>(
                              "admin/registrations/pending/detail?id=" +
                                encodeURIComponent(r.id),
                            );
                            setPendingDetail(detail);
                          } catch {
                            setPendingError(
                              "ไม่สามารถเปิดข้อมูลผู้ลงทะเบียนได้ กรุณาตรวจสอบสิทธิ์การใช้งาน",
                            );
                          }
                        }}
                      >
                        ดูข้อมูลติดต่อ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pendingDetail && (
          <section
            className="card"
            aria-label="ข้อมูลติดต่อผู้ลงทะเบียน"
            style={{ marginTop: 14, overflowWrap: "anywhere" }}
          >
            <h3>ข้อมูลสำหรับเจ้าหน้าที่ตรวจสอบ</h3>
            <p>
              สถานะ: ลงทะเบียนแล้ว
              แต่ผู้รับบริการยังไม่ได้ยืนยันการส่งคำขอหรือการจอง
            </p>
            <p>
              <strong>ชื่อ:</strong> {pendingDetail.contact.name || "—"}
            </p>
            <p>
              <strong>โทรศัพท์:</strong> {pendingDetail.contact.phone || "—"}
            </p>
            <p>
              <strong>อีเมล:</strong> {pendingDetail.contact.email || "—"}
            </p>
            <button
              type="button"
              className="button secondary small"
              onClick={() => setPendingDetail(null)}
            >
              ปิดรายละเอียด
            </button>
          </section>
        )}
      </section>
      <label className="field">
        กรองสถานะ
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">ทั้งหมด</option>
          {Object.entries(contactStatuses).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <form
        className="form-actions"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search);
          setPage(1);
        }}
      >
        <label className="field">
          ค้นหาเลขอ้างอิง
          <input
            value={search}
            maxLength={80}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="button secondary" type="submit">
          ค้นหา
        </button>
      </form>
      <div className="table-wrap">
        <table className="responsive-table">
          <caption>คำขอให้ติดต่อนัด ({total} รายการ)</caption>
          <thead>
            <tr>
              <th>เลขอ้างอิง</th>
              <th>วันที่</th>
              <th>สถานะ</th>
              <th>ผู้รับผิดชอบ</th>
              <th>รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id}>
                <td data-label="เลขอ้างอิง">{r.reference}</td>
                <td data-label="วันที่">{dateTime(r.createdAt)}</td>
                <td data-label="สถานะ">
                  {contactStatuses[r.status] ?? r.status}
                </td>
                <td data-label="ผู้รับผิดชอบ">
                  {assignees.find((a) => a.id === r.assignedTo)?.name ??
                    "ยังไม่กำหนด"}
                </td>
                <td data-label="รายละเอียด">
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={detailBusy}
                    onClick={async (e) => {
                      detailTrigger.current = e.currentTarget;
                      setDetailBusy(true);
                      setError("");
                      try {
                        setDetail(
                          await request<Contact>(
                            "admin/contact-requests/detail?id=" +
                              encodeURIComponent(r.id),
                          ),
                        );
                      } catch {
                        setError(
                          "ไม่สามารถเปิดรายละเอียดได้ กรุณาตรวจสอบสิทธิ์และลองใหม่",
                        );
                      } finally {
                        setDetailBusy(false);
                      }
                    }}
                  >
                    เปิดรายละเอียด {r.reference}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="form-actions" aria-label="หน้าคำขอ">
        <button
          className="button secondary"
          disabled={page <= 1 || busy}
          onClick={() => setPage((p) => p - 1)}
        >
          หน้าก่อน
        </button>
        <span role="status">
          หน้า {page} / {Math.max(1, Math.ceil(total / 20))}
        </span>
        <button
          className="button secondary"
          disabled={page * 20 >= total || busy}
          onClick={() => setPage((p) => p + 1)}
        >
          หน้าถัดไป
        </button>
      </nav>
      <Dialog.Root
        open={!!detail}
        onOpenChange={(open) => {
          if (!open && !busy) setDetail(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content
            className="modal"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              detailTrigger.current?.focus();
            }}
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              if (busy) e.preventDefault();
            }}
          >
            <Dialog.Title>รายละเอียดคำขอ {detail?.reference}</Dialog.Title>
            <Dialog.Description>
              ข้อมูลส่วนบุคคลสำหรับเจ้าหน้าที่ที่ได้รับอนุญาต
              การเปิดดูถูกบันทึกประวัติ
            </Dialog.Description>
            {error && <ErrorState message={error} />}
            {detail &&
              [detail].map((r) => (
                <article
                  className="card"
                  key={r.id}
                  style={{ marginBottom: 20 }}
                >
                  <h2>{r.reference}</h2>
                  <p>
                    {dateTime(r.createdAt)} · {contactStatuses[r.status]}
                  </p>
                  {r.details.contactVerification === "staff_pending" && (
                    <p>
                      การตรวจสอบเบอร์โทร: รอเจ้าหน้าที่ตรวจสอบ (ปิดระบบ OTP)
                    </p>
                  )}
                  <dl className="review-list">
                    {[
                      [
                        "ชื่อ",
                        r.details.person.firstName +
                          " " +
                          r.details.person.lastName,
                      ],
                      ["วันเกิด", r.details.person.birthdate],
                      [
                        "ส่วนสูง (cm)",
                        String(r.details.person.heightCm ?? "—"),
                      ],
                      [
                        "น้ำหนัก (kg)",
                        String(r.details.person.weightKg ?? "—"),
                      ],
                      [
                        "เพศ",
                        (
                          {
                            male: "ชาย",
                            female: "หญิง",
                            other: "อื่น ๆ",
                            unspecified: "ไม่ประสงค์ระบุ",
                          } as Record<string, string>
                        )[r.details.person.sex ?? ""],
                      ],
                      ["โทรศัพท์", r.details.person.phone],
                      ["อีเมล", r.details.person.email],
                      [
                        "สิทธิที่ผู้ใช้แจ้ง",
                        rights[r.details.person.treatmentRight ?? ""],
                      ],
                      [
                        "โรงพยาบาล / บริษัทประกัน",
                        r.details.person.treatmentRightDetails,
                      ],
                      [
                        "ประวัติโรค / การเจ็บป่วย",
                        r.details.person.medicalHistory,
                      ],
                      ["ผ่าตัด", r.details.person.surgeryHistory],
                      ["ยา / อาหารเสริม", r.details.person.currentMedication],
                      ["แพ้ยา อาหาร สารอื่น", r.details.person.allergies],
                      [
                        "NCD ญาติสายตรง",
                        r.details.person.familyNcdStatus === "no"
                          ? "ไม่มี"
                          : r.details.person.familyNcdStatus === "unknown"
                            ? "ไม่ทราบ"
                            : r.details.person.familyNcdDetails,
                      ],
                      ["ความช่วยเหลือ", r.details.person.assistance],
                      ["ภาษา", r.details.person.locale],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  {r.details.person.familyNcdEntries?.map((f, i) => (
                    <p key={i}>
                      {
                        {
                          mother: "มารดา",
                          father: "บิดา",
                          sibling: "พี่น้อง",
                          child: "บุตร",
                        }[f.relationship]
                      }
                      :{" "}
                      {
                        {
                          diabetes: "เบาหวาน",
                          hypertension: "ความดันโลหิตสูง",
                          heart_disease: "โรคหัวใจ",
                          stroke: "โรคหลอดเลือดสมอง",
                          cancer: "มะเร็ง",
                          other: "อื่น ๆ",
                        }[f.disease]
                      }{" "}
                      {f.note}
                    </p>
                  ))}
                  {r.details.interestedPackage && (
                    <p>
                      แพ็กเกจที่สนใจ: {r.details.interestedPackage.name} (รุ่น{" "}
                      {r.details.interestedPackage.version})
                    </p>
                  )}
                  <p>
                    {r.details.estimate?.lines.map((l) => l.name).join(" · ") ||
                      "ให้เจ้าหน้าที่แนะนำ"}{" "}
                    ·{" "}
                    {r.details.total
                      ? "ประมาณการเดิม " + r.details.total + " บาท"
                      : "ยังไม่มีประมาณการ"}
                  </p>
                  {r.details.supplements?.map((s, i) => (
                    <p key={i}>
                      ข้อมูลเพิ่มเติม {dateTime(s.at)}: {s.text}
                    </p>
                  ))}
                  <details>
                    <summary>
                      ข้อมูลแบบประเมิน เวอร์ชัน {r.details.questionnaireVersion}
                    </summary>
                    {Object.entries(r.details.answers).map(([k, v]) => (
                      <p key={k}>
                        {r.questions.find((q) => q.id === k)?.label ?? k}:{" "}
                        {String(v)}
                      </p>
                    ))}
                  </details>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const nextStatus = String(f.get("status"));
                      const dataReview = String(
                        f.get("dataReview") ?? "",
                      ).trim();
                      const entitlementReview = String(
                        f.get("entitlementReview") ?? "",
                      ).trim();
                      const entitlementStatus = String(
                        f.get("entitlementStatus"),
                      );
                      if (
                        nextStatus === "ready_to_schedule" &&
                        (!dataReview ||
                          !entitlementReview ||
                          !["verified", "unable_to_verify"].includes(
                            entitlementStatus,
                          ))
                      ) {
                        setError(
                          "การเปลี่ยนสถานะเป็นพร้อมนัดหมาย ต้องบันทึกผลตรวจข้อมูลและผลตรวจสิทธิ และเลือกสถานะตรวจสิทธิเป็นตรวจสอบแล้ว หรือตรวจสอบไม่ได้",
                        );
                        return;
                      }
                      void mutate("admin/contact-requests/status", {
                        id: r.id,
                        status: f.get("status"),
                        note: f.get("note"),
                        assignedTo: f.get("assignedTo"),
                        entitlementStatus: f.get("entitlementStatus"),
                        informationRequest: f.get("informationRequest"),
                        dataReview: f.get("dataReview"),
                        entitlementReview: f.get("entitlementReview"),
                      });
                    }}
                  >
                    <label className="field">
                      ผู้รับผิดชอบ
                      <select
                        name="assignedTo"
                        defaultValue={r.assignedTo ?? ""}
                      >
                        <option value="">ยังไม่กำหนด</option>
                        {assignees.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      สถานะ
                      <select
                        name="status"
                        defaultValue={r.status}
                        disabled={r.status === "closed"}
                      >
                        {Object.entries(contactStatuses)
                          .filter(([k]) => canReviewTransition(r.status, k))
                          .map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field">
                      ข้อมูลที่ขอให้ผู้ใช้ส่งเพิ่ม
                      <textarea
                        name="informationRequest"
                        defaultValue={r.review.informationRequest ?? ""}
                        maxLength={2000}
                      />
                    </label>
                    <label className="field">
                      ผลตรวจข้อมูล / ความเหมาะสม
                      <textarea
                        name="dataReview"
                        defaultValue={r.review.dataReview ?? ""}
                        maxLength={2000}
                      />
                    </label>
                    <label className="field">
                      สถานะตรวจสิทธิ
                      <select
                        name="entitlementStatus"
                        defaultValue={r.entitlementStatus}
                      >
                        <option value="unverified">ยังไม่ตรวจ</option>
                        <option value="pending">กำลังตรวจ</option>
                        <option value="verified">ตรวจสอบแล้ว</option>
                        <option value="unable_to_verify">ตรวจสอบไม่ได้</option>
                      </select>
                    </label>
                    <label className="field">
                      ผลตรวจสิทธิ / แหล่งข้อมูล / ข้อจำกัด
                      <textarea
                        name="entitlementReview"
                        defaultValue={r.review.entitlementReview ?? ""}
                        maxLength={2000}
                      />
                    </label>
                    <label className="field">
                      บันทึกการติดต่อ
                      <textarea
                        name="note"
                        defaultValue={r.note}
                        maxLength={2000}
                      />
                    </label>
                    <button
                      className="button"
                      disabled={busy || r.status === "closed"}
                    >
                      บันทึกผลการติดต่อ
                    </button>
                  </form>
                  <details>
                    <summary>ประวัติการติดต่อ</summary>
                    {r.review.contacts?.map((c, i) => (
                      <p key={i}>
                        {dateTime(c.at)} · {c.actorId} · {c.note}
                      </p>
                    ))}
                  </details>
                  {r.proposal && (
                    <section>
                      <h3>ประมาณการที่เสนอล่าสุด</h3>
                      {r.proposal.snapshot.lines.map((l, i) => (
                        <p key={i}>
                          {l.name}: {l.amount} บาท
                        </p>
                      ))}
                      <p>
                        รวม {String(r.proposal.total)} บาท · หมดอายุ{" "}
                        {dateTime(r.proposal.expiresAt)}
                      </p>
                    </section>
                  )}
                  {r.status === "ready_to_schedule" && (
                    <>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void mutate("admin/contact-requests/quote", {
                            id: r.id,
                            packageId: f.get("packageId"),
                            addonIds: f.getAll("addonIds"),
                          });
                        }}
                      >
                        <label className="field">
                          รายการตรวจและราคาใหม่
                          <select name="packageId" required>
                            <option value="">เลือกแพ็กเกจที่อนุมัติแล้ว</option>
                            {packages.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          รายการตรวจเพิ่มเติม (เลือกหลายรายการได้)
                          <select name="addonIds" multiple>
                            {services.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nameTh}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button className="button secondary" disabled={busy}>
                          เสนอราคาให้ผู้ใช้รับทราบ
                        </button>
                      </form>
                      <p>
                        {r.acceptedAt
                          ? "ผู้ใช้รับทราบราคาและวันเวลาแล้ว"
                          : "รอผู้ใช้รับทราบในหน้ารายการของฉัน ราคามีอายุ 15 นาที"}
                      </p>
                      <button
                        className="button"
                        disabled={busy || !r.acceptedAt}
                        onClick={() =>
                          mutate("admin/contact-requests/schedule", {
                            id: r.id,
                          })
                        }
                      >
                        สร้าง Booking จริงและตรวจความจุ
                      </button>
                    </>
                  )}
                  {r.bookingId && <p>Booking: {r.bookingId}</p>}
                </article>
              ))}
            <Dialog.Close className="button secondary" disabled={busy}>
              ปิดรายละเอียด
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {rows && rows.length === 0 && (
        <EmptyState>ไม่มีคำขอในสถานะนี้</EmptyState>
      )}
    </>
  );
}
