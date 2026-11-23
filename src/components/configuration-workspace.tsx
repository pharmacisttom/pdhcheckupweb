"use client";
import {
  questionnaireInventory,
  proposeRc03Questionnaire,
} from "@/lib/rc03-questionnaire";
import type { Question, RiskRule } from "@/lib/domain";
import { ManagedRecords } from "./managed-records";
import { useEffect, useState } from "react";
import { request, dateTime } from "@/lib/client";
import {
  closeLoading,
  showConfirm,
  showError,
  showLoading,
  showSuccess,
  showTextPrompt,
} from "@/lib/alerts";
import { ErrorState, Loading, PageHeader, StatusBadge } from "./ui";
type Questionnaire = {
  id: string;
  revision: number;
  version: number;
  status: string;
  questions: Question[];
  rules: RiskRule[];
  createdAt: string;
};
type CalendarDay = {
  id: string;
  capacity: number;
  blackout: boolean;
  slots: {
    id: string;
    startsAt: string;
    capacity: number;
    reservedCapacity: number;
  }[];
};

export function ConfigurationWorkspace({
  section,
}: {
  section: "questionnaires" | "calendar" | "waitlist";
}) {
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [editing, setEditing] = useState<{
    id: string;
    revision: number;
  } | null>(null);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [json, setJson] = useState(
    JSON.stringify(
      {
        questions: [
          {
            id: "review",
            label: "ต้องการให้เจ้าหน้าที่ประเมินก่อนจองหรือไม่",
            type: "single",
            options: ["ไม่ต้องการ", "ต้องการ"],
            required: true,
          },
        ],
        rules: [
          {
            id: "review-request",
            field: "review",
            equals: "ต้องการ",
            decision: "needs_clinical_review",
            reason: "ผู้รับบริการขอให้เจ้าหน้าที่ประเมินก่อนจอง",
          },
        ],
      },
      null,
      2,
    ),
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      if (section === "questionnaires")
        setQuestionnaires(await request("admin/questionnaires"));
      else if (section === "calendar")
        setCalendar(await request("admin/calendar"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps
  async function mutate(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    showLoading("กำลังบันทึกการตั้งค่า");
    try {
      await fn();
      setNotice("บันทึกข้อมูลแล้ว");
      await load();
      void showSuccess("บันทึกข้อมูลแล้ว");
    } catch (e) {
      setError((e as Error).message);
      void showError("บันทึกข้อมูลไม่สำเร็จ โปรดตรวจสอบรายละเอียดในหน้า");
    } finally {
      closeLoading();
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="CONFIGURATION & APPROVAL"
        title={
          section === "questionnaires"
            ? "แบบประเมินและกฎทางคลินิก"
            : section === "calendar"
              ? "ปฏิทินและวันงดให้บริการ"
              : "รายชื่อรอคิว"
        }
        description={
          section === "questionnaires"
            ? "กำหนดคำถามและกฎที่อธิบายได้ เก็บเวอร์ชันและอนุมัติก่อนใช้กับประชาชน"
            : "ข้อมูลจากระบบตามสิทธิ์ ไม่แสดงข้อมูลสุขภาพรายบุคคล"
        }
      />
      {error && <ErrorState message={error} />}{" "}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}{" "}
      {loading && <Loading />}
      {section === "questionnaires" && (
        <>
          <section className="card" style={{ marginBottom: 24 }}>
            <h2>
              {editing
                ? "แก้ไขแบบประเมินฉบับร่าง"
                : "สร้างแบบประเมินเวอร์ชันใหม่"}
            </h2>
            <div className="alert">
              รูปแบบ JSON สำหรับเจ้าหน้าที่ผู้กำหนดแบบประเมิน
              คำแนะนำต้องผ่านการทบทวนทางคลินิกก่อนกดอนุมัติ
              ไม่มีการสั่งตรวจอัตโนมัติ
            </div>
            <label className="field">
              คำถามและกฎฉบับร่าง
              <textarea
                rows={16}
                style={{ fontFamily: "monospace", fontSize: 12 }}
                disabled={loading || busy}
                value={json}
                onChange={(e) => setJson(e.target.value)}
              />
            </label>
            <button
              className="button"
              style={{ marginTop: 15 }}
              disabled={busy || loading}
              onClick={() =>
                mutate(() =>
                  request(
                    editing
                      ? "admin/questionnaires/update"
                      : "admin/questionnaires",
                    { ...JSON.parse(json), ...(editing ?? {}) },
                  ).then(() => setEditing(null)),
                )
              }
            >
              บันทึกฉบับร่าง
            </button>
          </section>
          {questionnaires.map((q) => (
            <article className="card" key={q.id} style={{ marginBottom: 15 }}>
              <div className="card-heading">
                <h2>แบบประเมินเวอร์ชัน {q.version}</h2>
                <StatusBadge status={q.status} />
              </div>
              <p>
                {q.questions.length} คำถาม · {q.rules.length} กฎ ·{" "}
                {dateTime(q.createdAt)}
              </p>
              <details>
                <summary>รายการคำถามและข้อเสนอให้แพทย์ทบทวน</summary>
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {JSON.stringify(
                    questionnaireInventory(q.questions, q.rules),
                    null,
                    2,
                  )}
                </pre>
                <p>
                  ข้อเสนออาจซ้ำกัน ต้องทบทวนข้อความ เงื่อนไข และคำแปลก่อนแก้ไข
                  ไม่ลบคำตอบหรือรหัสคำถามเดิมอัตโนมัติ
                </p>
              </details>
              <div className="actions">
                <button
                  className="button secondary small"
                  disabled={
                    busy ||
                    q.questions.some((item) => item.id === "snoring_history")
                  }
                  onClick={() => {
                    setEditing(null);
                    setJson(
                      JSON.stringify(
                        proposeRc03Questionnaire(q.questions, q.rules),
                        null,
                        2,
                      ),
                    );
                    setNotice(
                      "เตรียมข้อเสนอ RC03 แล้ว โปรดบันทึกเป็นฉบับร่างเพื่อรอแพทย์ทบทวน ยังไม่ได้เผยแพร่",
                    );
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  เตรียมฉบับร่าง RC03 พร้อมประวัติกรน
                </button>
                <button
                  className="button secondary small"
                  onClick={() => {
                    setEditing(null);
                    setJson(
                      JSON.stringify(
                        { questions: q.questions, rules: q.rules },
                        null,
                        2,
                      ),
                    );
                  }}
                >
                  ใช้เป็นต้นฉบับเวอร์ชันใหม่
                </button>
                {q.status === "draft" && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      setEditing({ id: q.id, revision: q.revision });
                      setJson(
                        JSON.stringify(
                          { questions: q.questions, rules: q.rules },
                          null,
                          2,
                        ),
                      );
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    แก้ไขฉบับร่าง
                  </button>
                )}
                {q.status !== "archived" && (
                  <button
                    className="button ghost"
                    disabled={busy}
                    onClick={async () => {
                      const reason = await showTextPrompt(
                        "เก็บแบบประเมินเข้าคลัง",
                        "ระบุเหตุผลที่เก็บแบบประเมินเข้าคลัง",
                        "เก็บเข้าคลัง",
                      );
                      if (
                        reason &&
                        (await showConfirm(
                          "เก็บแบบประเมินนี้เข้าคลังและหยุดใช้กับการลงทะเบียนใหม่หรือไม่",
                          "ยืนยันเก็บแบบประเมินเข้าคลัง",
                          "เก็บเข้าคลัง",
                        ))
                      )
                        await mutate(() =>
                          request("admin/questionnaires/archive", {
                            id: q.id,
                            revision: q.revision,
                            reason,
                          }),
                        );
                    }}
                  >
                    เก็บเข้าคลัง
                  </button>
                )}
                {q.status === "draft" && (
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await showConfirm(
                          "ยืนยันว่าตรวจสอบเนื้อหา เงื่อนไข และความเหมาะสมทางคลินิกแล้ว",
                          "อนุมัติแบบประเมิน",
                        )
                      )
                        await mutate(() =>
                          request("admin/questionnaires/approve", { id: q.id }),
                        );
                    }}
                  >
                    อนุมัติให้ใช้ลงทะเบียน
                  </button>
                )}
              </div>
            </article>
          ))}
        </>
      )}
      {section === "calendar" && (
        <>
          <ManagedRecords kind="slots" />
          <section className="card" style={{ marginBottom: 24 }}>
            <h2>ตั้งค่ารายวัน / วันหยุด</h2>
            <form
              method="post"
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                mutate(() =>
                  request("admin/calendar", {
                    day: f.get("day"),
                    capacity: Number(f.get("capacity")),
                    blackout: f.get("blackout") === "on",
                  }),
                );
              }}
            >
              <label className="field">
                วันให้บริการ
                <input type="date" name="day" required />
              </label>
              <label className="field">
                ความจุรวมรายวัน
                <input
                  type="number"
                  name="capacity"
                  min={0}
                  max={2000}
                  required
                />
              </label>
              <label className="check-label">
                <input type="checkbox" name="blackout" />
                ปิดวันให้บริการ / วันหยุด
              </label>
              <button className="button" disabled={busy}>
                บันทึกการตั้งค่า
              </button>
            </form>
          </section>
          <section className="card">
            {calendar.map((d) => (
              <article key={d.id}>
                <div className="card-heading">
                  <strong>
                    {d.id} · ความจุรวม {d.capacity}
                  </strong>
                  <span className="badge">
                    {d.blackout ? "วันงดให้บริการ" : "เปิดให้บริการ"}
                  </span>
                </div>
                <div className="slot-grid">
                  {d.slots.map((s) => (
                    <div className="slot" key={s.id}>
                      {dateTime(s.startsAt)}
                      <small>
                        ความจุ {s.capacity} · สำรององค์กร {s.reservedCapacity}
                      </small>
                    </div>
                  ))}
                </div>
                <div className="divider" />
              </article>
            ))}
          </section>
        </>
      )}
      {section === "waitlist" && <ManagedRecords kind="waitlist" />}
    </>
  );
}
