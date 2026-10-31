"use client";
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { request, money, dateTime } from "@/lib/client";
type Kind =
  "organizations" | "services" | "slots" | "waitlist" | "finance" | "privacy";
type Row = { id: string; revision: number; [key: string]: unknown };
type Result = {
  assignees: { id: string; name: string }[];
  rows: Row[];
  total: number;
  page: number;
  capabilities: { write: boolean; approve: boolean };
};
const names: Record<Kind, string> = {
  organizations: "จัดการองค์กร",
  services: "ข้อมูลรายการตรวจและประวัติราคา",
  slots: "จัดการช่วงเวลาให้บริการ",
  waitlist: "จัดการคิวรอ",
  finance: "บันทึกการเงินและประวัติรายการ",
  privacy: "ดำเนินคำร้องข้อมูลส่วนบุคคล",
};
const labels: Record<string, string> = {
  draft: "ฉบับร่าง",
  active: "ใช้งาน",
  inactive: "ปิดใช้งาน",
  waiting: "รอการติดต่อ",
  contacted: "ติดต่อแล้ว",
  scheduled: "มีนัดจริง",
  closed: "ปิดเรื่อง",
  cancelled: "ยกเลิก",
  pending_identity_review: "รอตรวจตัวตน",
  under_review: "กำลังตรวจสอบ",
  awaiting_information: "รอข้อมูลเพิ่ม",
  processing: "กำลังดำเนินการ",
  completed: "ดำเนินการแล้ว",
  rejected: "ไม่รับคำร้อง",
  estimate: "ประมาณการ",
  approved: "อนุมัติยอดแล้ว",
  billed: "เรียกเก็บแล้ว",
  partially_paid: "รับชำระบางส่วน",
  paid: "รับครบแล้ว",
  void: "ยกเลิกเอกสาร",
  approve: "อนุมัติยอด",
  bill: "บันทึกยอดเรียกเก็บ",
  payment: "บันทึกรับชำระ",
  refund: "บันทึกคืนเงิน",
  verify_identity: "ยืนยันตรวจตัวตน",
  update: "บันทึกสถานะ/ผู้รับผิดชอบ",
};
export function ManagedRecords({ kind }: { kind: Kind }) {
  const [data, setData] = useState<Result | null>(null),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    [open, setOpen] = useState(false),
    [creating, setCreating] = useState(false);
  const [privacyChats, setPrivacyChats] = useState<
    { id: string; status: string; departmentId: string }[]
  >([]);
  async function loadPrivacyChats() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      setPrivacyChats(
        await request("admin/manage/privacy/" + selected.id + "/chats"),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function redactChat(conversationId: string) {
    if (!selected) return;
    const reason = window.prompt(
      "เหตุผล/หลักฐานอนุมัติการปกปิดแชตตามคำร้อง (ห้ามใส่ข้อมูลสุขภาพ)",
    );
    if (!reason?.trim()) return;
    if (
      !window.confirm(
        "ยืนยันปกปิดข้อความแชตตามคำร้องที่ตรวจสอบแล้ว? รายการนี้จะไม่สามารถอ่านผ่านระบบได้",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request(
        "admin/manage/privacy/" + selected.id + "/chats/" + conversationId,
        { revision: selected.revision, reason, confirmed: true },
      );
      setSelected(await request<Row>(endpoint + "/" + selected.id));
      setPrivacyChats((old) => old.filter((c) => c.id !== conversationId));
      await load();
      setNotice("ปกปิดแชตและบันทึกประวัติคำร้องแล้ว");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const pending = useRef<{ body: string; key: string } | null>(null);
  const endpoint = "admin/manage/" + kind;
  async function load() {
    setData(
      await request<Result>(
        endpoint + "?" + new URLSearchParams({ page: String(page), q: query }),
      ),
    );
  }
  useEffect(() => {
    let cancelled = false;
    setError("");
    request<Result>(
      endpoint + "?" + new URLSearchParams({ page: String(page), q: query }),
    )
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, page, query]);
  async function edit(row: Row) {
    setBusy(true);
    setError("");
    try {
      const detail = [
        "organizations",
        "services",
        "finance",
        "privacy",
        "waitlist",
      ].includes(kind)
        ? await request<Row>(endpoint + "/" + row.id)
        : row;
      setSelected(detail);
      setPrivacyChats([]);
      setCreating(false);
      pending.current = null;
      setOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(form: HTMLFormElement) {
    const f = new FormData(form),
      text = (key: string) => String(f.get(key) ?? "").trim();
    setBusy(true);
    setError("");
    try {
      let body: Record<string, unknown> = {
        revision: selected?.revision ?? 0,
        reason: text("reason"),
      };
      if (kind === "organizations")
        body = {
          ...body,
          name: text("name"),
          contact: text("contact"),
          status: text("status"),
        };
      if (kind === "services") {
        body = {
          ...body,
          nameTh: text("nameTh"),
          nameEn: text("nameEn"),
          category: text("category"),
          unit: text("unit"),
          preparation: text("preparation"),
          active: f.has("active"),
          requiresReview: f.has("requiresReview"),
        };
        if (creating) {
          delete body.revision;
          delete body.reason;
          body.code = text("code");
        }
      }
      if (kind === "slots")
        body = {
          ...body,
          capacity: Number(f.get("capacity")),
          reservedCapacity: Number(f.get("reservedCapacity")),
          closed: f.has("closed"),
        };
      if (kind === "waitlist")
        body = {
          ...body,
          status: text("status"),
          assigneeId: text("assigneeId") || null,
          bookingReference: text("bookingReference"),
        };
      if (kind === "privacy")
        body = {
          ...body,
          action: text("action"),
          status: text("status"),
          assigneeId: text("assigneeId") || null,
          confirmed: f.has("confirmed"),
        };
      if (kind === "finance") {
        body = {
          ...body,
          action: text("action"),
          amount: text("amount"),
          reference: text("reference"),
        };
        const canonical = JSON.stringify(body);
        if (pending.current?.body !== canonical)
          pending.current = { body: canonical, key: crypto.randomUUID() };
        body.idempotencyKey = pending.current.key;
      }
      if (creating && kind === "organizations")
        await request("admin/organizations", {
          name: text("name"),
          contact: text("contact"),
        });
      else if (creating && kind === "slots")
        await request("admin/slots", {
          day: text("day"),
          time: text("time"),
          capacity: Number(f.get("capacity")),
          dailyCapacity: Number(f.get("dailyCapacity")),
        });
      else await request(endpoint + (creating ? "" : "/" + selected!.id), body);
      setOpen(false);
      pending.current = null;
      setNotice("บันทึกเรียบร้อย");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const initial = (key: string, fallback = "") =>
    String(selected?.[key] ?? fallback);
  const input = (
    key: string,
    label: string,
    options: { type?: string; required?: boolean; maxLength?: number } = {},
  ) => (
    <label className="field" key={key}>
      {label}
      <input
        name={key}
        aria-label={label}
        type={options.type ?? "text"}
        required={options.required ?? true}
        maxLength={options.maxLength ?? 255}
        defaultValue={initial(key)}
        min={options.type === "number" ? 0 : undefined}
      />
    </label>
  );
  const area = (key: string, label: string, required = true) => (
    <div className="field" key={key}>
      <label htmlFor={kind + "-" + key}>{label}</label>
      <textarea
        id={kind + "-" + key}
        name={key}
        defaultValue={initial(key)}
        required={required}
        maxLength={
          key === "preparation" ? 3000 : key === "contact" ? 1000 : 1500
        }
        rows={3}
      />
    </div>
  );
  const select = (
    key: string,
    label: string,
    choices: string[],
    fallback = "",
  ) => (
    <label className="field" key={key}>
      {label}
      <select
        aria-label={label}
        name={key}
        defaultValue={initial(key, fallback)}
      >
        {choices.map((v) => (
          <option key={v} value={v}>
            {labels[v] ?? v}
          </option>
        ))}
      </select>
    </label>
  );
  const assigneeSelect = (
    <label className="field">
      ผู้รับผิดชอบ
      <select
        aria-label="ผู้รับผิดชอบ"
        name="assigneeId"
        defaultValue={initial("assigneeId")}
      >
        <option value="">ยังไม่มอบหมาย</option>
        {initial("assigneeId") &&
          !data?.assignees.some((u) => u.id === initial("assigneeId")) && (
            <option value={initial("assigneeId")}>
              ผู้รับผิดชอบเดิม (ต้องตรวจสิทธิ์ใหม่)
            </option>
          )}
        {data?.assignees.map((u) => (
          <option value={u.id} key={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
  const check = (key: string, label: string, fallback = false) => (
    <label className="check-label" key={key}>
      <input
        name={key}
        type="checkbox"
        defaultChecked={Boolean(selected?.[key] ?? fallback)}
      />
      {label}
    </label>
  );
  const history = (key: string) =>
    Array.isArray(selected?.[key])
      ? (selected![key] as Record<string, unknown>[])
      : [];
  return (
    <section className="card stack managed-records">
      <h2>{names[kind]}</h2>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="alert" role="status">
          {notice}
        </p>
      )}
      <form
        className="actions"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search);
        }}
      >
        <label className="field">
          {kind === "slots" ? "ค้นหาวัน (YYYY-MM-DD)" : "ค้นหาในฐานข้อมูล"}
          <input
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="button secondary">ค้นหา</button>
        {data?.capabilities.write &&
          ["organizations", "services", "slots"].includes(kind) && (
            <button
              className="button"
              type="button"
              onClick={() => {
                setSelected(null);
                setCreating(true);
                setError("");
                setOpen(true);
              }}
            >
              เพิ่ม
              {kind === "organizations"
                ? "องค์กร"
                : kind === "services"
                  ? "รายการตรวจ"
                  : "ช่วงเวลา"}
            </button>
          )}
      </form>
      {kind === "finance" && (
        <p>
          บันทึกยอดและหลักฐานที่เจ้าหน้าที่ตรวจสอบแล้ว
          การบันทึกนี้ไม่ได้โอนเงินจริงหรือเชื่อม payment gateway
        </p>
      )}
      {kind === "privacy" && (
        <p>
          บันทึกขั้นตอนพิจารณาคำร้อง
          การปิดคำร้องไม่ได้ลบข้อมูลหรือส่งเอกสารให้ผู้ใช้โดยอัตโนมัติ
        </p>
      )}
      {kind === "waitlist" && (
        <p>
          ติดต่อผู้ใช้และสร้างนัดผ่านขั้นตอนจองเดิมก่อนระบุเลขนัด
          ระบบตรวจเจ้าของรายการและวันนัดอีกครั้ง
        </p>
      )}
      {data?.rows.map((row) => (
        <article className="card" key={row.id}>
          <div className="card-heading">
            <strong>
              {kind === "organizations"
                ? String(row.name)
                : kind === "services"
                  ? String(row.code) + " · " + String(row.nameTh)
                  : kind === "slots"
                    ? dateTime(String(row.startsAt))
                    : kind === "waitlist"
                      ? String(row.dayId)
                      : kind === "privacy"
                        ? "คำร้อง " + String(row.type)
                        : "เอกสาร " + row.id.slice(-12)}
            </strong>
            <span>
              {kind === "services"
                ? row.active
                  ? "ใช้งาน"
                  : "ปิดใช้งาน"
                : kind === "slots"
                  ? row.closed
                    ? "ปิดช่วงเวลา"
                    : "เปิดช่วงเวลา"
                  : (labels[String(row.status)] ?? String(row.status))}
            </span>
          </div>
          <small>{row.id}</small>
          {kind === "slots" && (
            <p>
              ความจุ {String(row.capacity)} · สำรององค์กร{" "}
              {String(row.reservedCapacity)} · จอง/hold ที่มีผล{" "}
              {String(row.occupied)}
            </p>
          )}
          {kind === "finance" && (
            <p>
              ประมาณการ {money(String(row.estimatedAmount))} · อนุมัติ{" "}
              {row.approvedAmount == null
                ? "—"
                : money(String(row.approvedAmount))}{" "}
              · เรียกเก็บ{" "}
              {row.actualBilledAmount == null
                ? "—"
                : money(String(row.actualBilledAmount))}{" "}
              · รับไว้ {money(String(row.paidAmount ?? 0))}
            </p>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void edit(row)}
          >
            {data.capabilities.write ? "ดูรายละเอียด / แก้ไข" : "ดูรายละเอียด"}
          </button>
        </article>
      ))}
      {data && !data.rows.length && <p>ไม่พบรายการ</p>}
      <div className="actions">
        <button
          className="button secondary"
          disabled={page <= 1 || busy}
          onClick={() => setPage((p) => p - 1)}
        >
          ก่อนหน้า
        </button>
        <span>
          หน้า {page} · ทั้งหมด {data?.total ?? 0} รายการ
        </span>
        <button
          className="button secondary"
          disabled={!data || page * 25 >= data.total || busy}
          onClick={() => setPage((p) => p + 1)}
        >
          ถัดไป
        </button>
      </div>
      <Dialog.Root
        open={open}
        onOpenChange={(v) => {
          if (!busy) {
            setOpen(v);
            if (!v) setError("");
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="modal">
            <Dialog.Title>
              {creating ? "เพิ่มข้อมูล" : names[kind]}
            </Dialog.Title>
            <Dialog.Description>
              ตรวจสอบข้อมูลและเหตุผลก่อนบันทึก
              การเปลี่ยนแปลงจะถูกเก็บเป็นประวัติ
            </Dialog.Description>
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
            <form
              className="stack"
              key={selected?.id ?? "new"}
              onSubmit={(e) => {
                e.preventDefault();
                void save(e.currentTarget);
              }}
            >
              <fieldset
                disabled={busy || !data?.capabilities.write}
                className="stack"
              >
                {kind === "organizations" && (
                  <>
                    {input("name", "ชื่อองค์กร")}
                    {area("contact", "ผู้ประสานงาน / ช่องทางติดต่อ")}
                    {!creating &&
                      select("status", "สถานะองค์กร", [
                        "draft",
                        "active",
                        "inactive",
                      ])}
                  </>
                )}
                {kind === "services" && (
                  <>
                    {creating ? (
                      input("code", "รหัสบริการ")
                    ) : (
                      <p>รหัสบริการ: {initial("code")} (แก้ไขรหัสเดิมไม่ได้)</p>
                    )}
                    {input("nameTh", "ชื่อบริการภาษาไทย")}
                    {input("nameEn", "ชื่อบริการภาษาอังกฤษ", {
                      required: false,
                    })}
                    {input("category", "หมวดหมู่")}
                    {input("unit", "หน่วย")}
                    {area(
                      "preparation",
                      "คำแนะนำเตรียมตัวที่ได้รับการทบทวน",
                      false,
                    )}
                    {check("active", "เปิดใช้งาน", true)}
                    {check("requiresReview", "ต้องให้เจ้าหน้าที่ทบทวนก่อนจอง")}
                    <p>
                      ราคาต้องนำเข้าและอนุมัติผ่าน workflow ราคาเดิม
                      ข้อมูลนี้ไม่แก้ทับประวัติราคา
                    </p>
                  </>
                )}
                {kind === "slots" && (
                  <>
                    {creating && (
                      <>
                        {input("day", "วันให้บริการ", { type: "date" })}
                        {input("time", "เวลาเริ่มต้น (ไทย)", { type: "time" })}
                        {input("dailyCapacity", "ความจุรายวัน", {
                          type: "number",
                        })}
                      </>
                    )}
                    {input("capacity", "ความจุช่วงเวลา", { type: "number" })}
                    {!creating && (
                      <>
                        {input("reservedCapacity", "สำรององค์กร", {
                          type: "number",
                        })}
                        {check("closed", "ปิดช่วงเวลา")}
                      </>
                    )}
                  </>
                )}
                {kind === "waitlist" && (
                  <>
                    {select("status", "สถานะคิวรอ", [
                      "waiting",
                      "contacted",
                      "scheduled",
                      "closed",
                      "cancelled",
                    ])}
                    {assigneeSelect}
                    {input(
                      "bookingReference",
                      "เลขนัดจริง เมื่อตั้งสถานะมีนัด",
                      { required: false },
                    )}
                    {!!selected?.contact && (
                      <p>
                        ข้อมูลติดต่อ:{" "}
                        {String(
                          (selected.contact as Record<string, unknown>).name ??
                            "",
                        )}{" "}
                        ·{" "}
                        {String(
                          (selected.contact as Record<string, unknown>).phone ??
                            "",
                        )}{" "}
                        ·{" "}
                        {String(
                          (selected.contact as Record<string, unknown>).email ??
                            "",
                        )}{" "}
                        (เจ้าหน้าที่ต้องตรวจสอบช่องทางติดต่อ)
                      </p>
                    )}
                  </>
                )}
                {kind === "finance" && (
                  <>
                    {select(
                      "action",
                      "รายการดำเนินการ",
                      data?.capabilities.approve
                        ? ["approve", "bill", "payment", "refund", "void"]
                        : ["bill", "payment"],
                      "bill",
                    )}
                    {input("amount", "ยอดเงิน (ยกเลิกเอกสารให้ระบุ 0)")}
                    {input("reference", "เลขหลักฐาน/เอกสารอ้างอิง", {
                      required: false,
                      maxLength: 200,
                    })}
                  </>
                )}
                {kind === "privacy" && (
                  <>
                    {select(
                      "action",
                      "รายการดำเนินการ",
                      ["update", "verify_identity"],
                      "update",
                    )}
                    {select("status", "สถานะคำร้อง", [
                      "pending_identity_review",
                      "under_review",
                      "awaiting_information",
                      "processing",
                      "completed",
                      "rejected",
                      "closed",
                    ])}
                    {assigneeSelect}
                    {check("confirmed", "ตรวจตัวตนตามขั้นตอนของโรงพยาบาลแล้ว")}
                    <p>
                      ตรวจตัวตนแล้ว:{" "}
                      {selected?.identityVerifiedAt
                        ? dateTime(String(selected.identityVerifiedAt))
                        : "ยังไม่ได้ยืนยัน"}
                    </p>
                  </>
                )}
                {!creating &&
                  area(
                    "reason",
                    kind === "privacy"
                      ? "เหตุผล / ผลดำเนินการ / หลักฐานตรวจตัวตน"
                      : "เหตุผล / บันทึกดำเนินการ",
                  )}
                <button className="button" disabled={busy}>
                  บันทึก
                </button>
              </fieldset>
            </form>
            {kind === "services" && (
              <section>
                <h3>ประวัติราคา (ล่าสุดไม่เกิน 100 รุ่น)</h3>
                {history("prices").map((p) => (
                  <p key={String(p.id)}>
                    รุ่น {String(p.version)} · {money(String(p.amount))} · เริ่ม{" "}
                    {dateTime(String(p.effectiveFrom))}
                  </p>
                ))}
              </section>
            )}
            {kind === "finance" && (
              <section>
                <h3>ประวัติการเงิน (ล่าสุด 100 รายการ)</h3>
                {history("entries").map((e) => (
                  <article key={String(e.id)}>
                    <strong>
                      {labels[String(e.action)] ?? String(e.action)} ·{" "}
                      {money(String(e.amount))}
                    </strong>
                    <p>
                      {String(e.reason)} · {String(e.reference)} ·{" "}
                      {dateTime(String(e.createdAt))}
                    </p>
                  </article>
                ))}
              </section>
            )}
            {kind === "privacy" && (
              <section>
                <h3>ประวัติคำร้อง (ล่าสุด 100 รายการ)</h3>
                {history("events").map((e) => (
                  <article key={String(e.id)}>
                    <strong>
                      {labels[String(e.nextStatus)] ?? String(e.nextStatus)}
                    </strong>
                    <p>
                      {String(e.note)} · {dateTime(String(e.createdAt))}
                    </p>
                  </article>
                ))}
              </section>
            )}
            {kind === "privacy" &&
              selected?.type === "deletion" &&
              selected.status === "processing" &&
              !!selected.identityVerifiedAt && (
                <section className="stack">
                  <h3>แชตของเจ้าของคำร้อง</h3>
                  <p>
                    แสดงเฉพาะข้อมูลรายการ ไม่เปิดอ่านข้อความแชต
                    การปกปิดนี้ไม่ลบข้อมูลจาก backup
                  </p>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void loadPrivacyChats()}
                  >
                    ตรวจรายการแชตที่เชื่อมกับคำร้อง
                  </button>
                  {privacyChats.map((c) => (
                    <article key={c.id}>
                      <p>
                        {c.id} · {c.departmentId} · {c.status}
                      </p>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => void redactChat(c.id)}
                      >
                        ปกปิดแชตตามคำร้อง
                      </button>
                    </article>
                  ))}
                </section>
              )}
            <Dialog.Close className="button secondary" disabled={busy}>
              ปิด
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
