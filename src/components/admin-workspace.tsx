"use client";
import { useEffect, useState } from "react";
import { Download, Plus, Upload } from "lucide-react";
import { request, money, dateTime, type PublicService } from "@/lib/client";
import { EmptyState, ErrorState, Loading, PageHeader, StatusBadge } from "./ui";
type Row = Record<string, unknown>;
const titles: Record<string, [string, string]> = {
  appointments: [
    "จัดการนัดหมาย",
    "กำหนดช่วงเวลา รับเช็กอิน และติดตามสถานะการให้บริการ",
  ],
  packages: [
    "แพ็กเกจตรวจสุขภาพ",
    "สร้างฉบับร่าง เก็บประวัติแต่ละเวอร์ชัน และอนุมัติก่อนเผยแพร่",
  ],
  "lab-pricing": [
    "PDH Smart Pricing Engine",
    "นำเข้า ตรวจสอบความเปลี่ยนแปลง และอนุมัติราคาบริการ",
  ],
  organizations: [
    "หน่วยงานและองค์กร",
    "ข้อมูลประสานงานองค์กร แยกจากข้อมูลสุขภาพรายบุคคล",
  ],
  quotations: ["ใบเสนอราคา", "ค่าใช้จ่ายประมาณการจากราคาฉบับที่ใช้ตอนจอง"],
  billing: [
    "การเงินและค่าบริการ",
    "แยกประมาณการ ยอดอนุมัติ ยอดเรียกเก็บ และยอดรับชำระ",
  ],
  reports: ["รายงานการให้บริการ", "สรุปสถานะนัดหมายที่สร้างภายใน 30 วันล่าสุด"],
  audit: ["บันทึกการใช้งาน", "ประวัติการเปลี่ยนแปลงและการดำเนินการที่สำคัญ"],
  privacy: [
    "คุ้มครองข้อมูลส่วนบุคคล",
    "คำขอใช้สิทธิ รอตรวจสอบตัวตนและพิจารณาโดยผู้รับผิดชอบ",
  ],
};
const endpoints: Record<string, string> = {
  appointments: "bookings",
  packages: "packages",
  "lab-pricing": "imports",
  organizations: "organizations",
  quotations: "quotations",
  billing: "quotations",
  reports: "reports",
  audit: "audit",
  privacy: "privacy",
};
export function AdminWorkspace({ section }: { section: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [services, setServices] = useState<PublicService[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const title = titles[section];
  async function load() {
    setError("");
    try {
      const records = await request<Row[]>("admin/" + endpoints[section]);
      setRows(records);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    if (section === "packages")
      request<PublicService[]>("services")
        .then(setServices)
        .catch((e) => setError(e.message));
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps
  async function mutate(
    fn: () => Promise<unknown>,
    success = "บันทึกข้อมูลแล้ว",
  ) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
      setNotice(success);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!title) return <EmptyState />;
  const visible = rows?.filter((r) =>
    JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="HEALTH CHECK MANAGEMENT"
        title={title[0]}
        description={title[1]}
      >
        {["packages", "appointments", "organizations", "lab-pricing"].includes(
          section,
        ) && (
          <button
            className="button small"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus size={16} />
            {showForm
              ? "ปิดแบบฟอร์ม"
              : section === "lab-pricing"
                ? "นำเข้าราคา"
                : "เพิ่มข้อมูล"}
          </button>
        )}
      </PageHeader>
      {error && <ErrorState message={error} />}{" "}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      {showForm && (
        <section className="card" style={{ marginBottom: 24 }}>
          {section === "organizations" && (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.currentTarget));
                mutate(() => request("admin/organizations", f));
              }}
            >
              <h2>เพิ่มองค์กร (ฉบับร่าง)</h2>
              <label className="field">
                ชื่อองค์กร
                <input name="name" required maxLength={255} />
              </label>
              <label className="field">
                ข้อมูลผู้ประสานงาน
                <textarea name="contact" required maxLength={1000} />
                <small>เข้ารหัสข้อมูลนี้ ไม่แสดงในรายงานทั่วไป</small>
              </label>
              <button className="button" disabled={busy}>
                บันทึกองค์กร
              </button>
            </form>
          )}
          {section === "appointments" && (
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                mutate(() =>
                  request("admin/slots", {
                    day: f.get("day"),
                    time: f.get("time"),
                    capacity: Number(f.get("capacity")),
                    dailyCapacity: Number(f.get("dailyCapacity")),
                  }),
                );
              }}
            >
              <h2 className="full">เพิ่มช่วงเวลาให้บริการ</h2>
              <label className="field">
                วันให้บริการ
                <input type="date" name="day" required />
              </label>
              <label className="field">
                เวลาเริ่มต้น (ไทย)
                <input type="time" name="time" required />
              </label>
              <label className="field">
                ความจุช่วงเวลา
                <input
                  type="number"
                  min={1}
                  max={500}
                  name="capacity"
                  required
                />
              </label>
              <label className="field">
                ความจุรวมรายวัน
                <input
                  type="number"
                  min={1}
                  max={2000}
                  name="dailyCapacity"
                  required
                />
              </label>
              <p className="full">
                ช่วงเวลายาว 1 ชั่วโมง ความจุรายวันต้องตรงกับค่าที่กำหนดไว้เดิม
              </p>
              <button className="button" disabled={busy}>
                บันทึกช่วงเวลา
              </button>
            </form>
          )}
          {section === "packages" && (
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                mutate(
                  () =>
                    request("admin/packages", {
                      ...Object.fromEntries(f),
                      minAge: Number(f.get("minAge")),
                      maxAge: Number(f.get("maxAge")),
                      serviceIds: selectedServices,
                    }),
                  "สร้างเวอร์ชันฉบับร่างแล้ว ต้องได้รับการอนุมัติก่อนแสดงในเว็บไซต์",
                );
              }}
            >
              <h2 className="full">สร้างแพ็กเกจฉบับร่าง / เวอร์ชันใหม่</h2>
              <label className="field">
                รหัสตระกูลแพ็กเกจ
                <input name="key" required maxLength={80} />
                <small>ใช้รหัสเดิมเพื่อสร้างเวอร์ชันถัดไป</small>
              </label>
              <label className="field">
                ชื่อแพ็กเกจ
                <input name="name" required maxLength={255} />
              </label>
              <label className="field full">
                รายละเอียด
                <textarea name="description" required maxLength={3000} />
              </label>
              <label className="field">
                กลุ่มเป้าหมาย
                <input name="audience" required maxLength={255} />
              </label>
              <label className="field">
                ราคาเหมาจ่าย (บาท)
                <input
                  name="fixedPrice"
                  inputMode="decimal"
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                  required
                />
              </label>
              <label className="field">
                อายุต่ำสุด
                <input
                  name="minAge"
                  type="number"
                  min={0}
                  max={130}
                  defaultValue={0}
                  required
                />
              </label>
              <label className="field">
                อายุสูงสุด
                <input
                  name="maxAge"
                  type="number"
                  min={0}
                  max={130}
                  defaultValue={120}
                  required
                />
              </label>
              <label className="field">
                วันที่มีผล
                <input name="effectiveFrom" type="date" required />
              </label>
              <label className="field full">
                การเตรียมตัว
                <textarea name="preparation" required maxLength={3000} />
              </label>
              <div className="full">
                <h3>รายการตรวจที่รวมในแพ็กเกจ</h3>
                {services.map((s) => (
                  <label className="service-row" key={s.id}>
                    <input
                      type="checkbox"
                      checked={selectedServices.includes(s.id)}
                      onChange={(e) =>
                        setSelectedServices((v) =>
                          e.target.checked
                            ? [...v, s.id]
                            : v.filter((id) => id !== s.id),
                        )
                      }
                    />
                    <span>
                      {s.code} · {s.nameTh}
                    </span>
                  </label>
                ))}
                {!services.length && (
                  <p>ยังไม่มีบริการที่เปิดใช้งาน ต้องนำเข้าราคาบริการก่อน</p>
                )}
              </div>
              <button className="button" disabled={busy}>
                บันทึกฉบับร่าง
              </button>
            </form>
          )}
          {section === "lab-pricing" && (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                mutate(
                  () => request("admin/imports", f),
                  "นำเข้าเพื่อพรีวิวแล้ว — ยังไม่เผยแพร่ราคา",
                );
              }}
            >
              <h2>เตรียมนำเข้าราคาบริการ</h2>
              <p>รองรับ CSV/XLSX สูงสุด 2 MB และ 5,000 แถว ไม่รับสูตร Excel</p>
              <a
                className="button secondary small"
                href="/templates/service-prices.csv"
                download
              >
                <Download size={15} />
                ดาวน์โหลดแม่แบบนำเข้า
              </a>
              <label className="field">
                เลือกไฟล์
                <input type="file" name="file" accept=".csv,.xlsx" required />
              </label>
              <label className="field">
                จับคู่ชื่อคอลัมน์ (JSON, ไม่บังคับ)
                <textarea name="mapping" defaultValue="{}" />
                <small>
                  ตัวอย่าง:{" "}
                  {JSON.stringify({
                    service_code: "รหัส",
                    standard_price: "ราคา",
                  })}
                </small>
              </label>
              <button className="button" disabled={busy}>
                <Upload size={16} />
                ตรวจสอบและพรีวิว
              </button>
              <p>
                ราคาในไฟล์แม่แบบยังไม่ได้รับการอนุมัติจากโรงพยาบาล
                ต้องใช้ผู้อนุมัติคนละคนกับผู้นำเข้า
              </p>
            </form>
          )}
        </section>
      )}
      {section === "appointments" && (
        <section className="card" style={{ marginBottom: 24 }}>
          <h3>เช็กอินด้วย QR token</h3>
          <form
            className="toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const token = String(f.get("token")).replace(/^PDH-CHECKIN:/, "");
              mutate(
                () => request("admin/checkin", { token }),
                "เช็กอินสำเร็จ",
              );
            }}
          >
            <label className="field" style={{ maxWidth: "none", flex: 1 }}>
              สแกนหรือวางค่าจาก QR
              <input
                name="token"
                required
                placeholder="PDH-CHECKIN:…"
                autoComplete="off"
              />
            </label>
            <button className="button small" disabled={busy}>
              ยืนยันเช็กอิน
            </button>
          </form>
        </section>
      )}
      {section === "billing" && (
        <div className="alert">
          ยังไม่เปิดรับชำระเงินหรือออกใบเสร็จ
          ต้องผ่านการอนุมัติขั้นตอนงานจากฝ่ายการเงิน ยอดประมาณการไม่ใช่รายได้
        </div>
      )}
      {section === "reports" && (
        <div className="quick-actions">
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() =>
              mutate(async () => {
                const result = await request<{ csv: string; filename: string }>(
                  "admin/reports/export",
                  {},
                );
                const url = URL.createObjectURL(
                  new Blob(["\uFEFF" + result.csv], {
                    type: "text/csv;charset=utf-8",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = result.filename;
                a.click();
                URL.revokeObjectURL(url);
              })
            }
          >
            <Download size={16} />
            ส่งออกรายงานสรุป 30 วัน
          </button>
          <button
            className="button secondary small"
            onClick={() => window.print()}
          >
            พิมพ์รายงาน
          </button>
        </div>
      )}
      <section className="card">
        <div className="card-heading">
          <h2>{title[0]}</h2>
          <input
            aria-label="ค้นหาในรายการ"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา…"
            style={{ maxWidth: 230 }}
          />
        </div>
        {rows === null && !error ? (
          <Loading />
        ) : !visible?.length ? (
          <EmptyState>ยังไม่มีข้อมูลที่แสดงได้ตามสิทธิ์ของคุณ</EmptyState>
        ) : section === "lab-pricing" ? (
          <div className="stack">
            {visible.map((r) => (
              <article className="card" key={String(r.id)}>
                <div className="card-heading">
                  <strong>ชุดนำเข้า {String(r.id).slice(-8)}</strong>
                  <StatusBadge status={String(r.status)} />
                </div>
                <p style={{ fontSize: 11 }}>
                  SHA-256: {String(r.fileHash)}
                  <br />
                  วันที่ {dateTime(String(r.createdAt))}
                </p>
                {(r.errors as { row: number; message: string }[]).map(
                  (e, i) => (
                    <ErrorState
                      key={i}
                      message={"แถว " + e.row + ": " + e.message}
                    />
                  ),
                )}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>รหัส</th>
                        <th>รายการ</th>
                        <th>ราคาเดิม</th>
                        <th>ราคาใหม่</th>
                        <th>ผลเปรียบเทียบ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        r.comparisons as {
                          code: string;
                          name: string;
                          previous: string | null;
                          imported: string;
                          mismatch: boolean;
                        }[]
                      ).map((c) => (
                        <tr key={c.code}>
                          <td>{c.code}</td>
                          <td>{c.name}</td>
                          <td>{c.previous ? money(c.previous) : "—"}</td>
                          <td>{money(c.imported)}</td>
                          <td>
                            {c.mismatch
                              ? "ต้องทบทวนการจับคู่"
                              : c.previous === null
                                ? "รหัสใหม่"
                                : Number(c.previous) === Number(c.imported)
                                  ? "ราคาเดิม"
                                  : "ราคาเปลี่ยนแปลง"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {r.status === "staged" && (
                  <button
                    className="button small"
                    style={{ marginTop: 20 }}
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "ยืนยันอนุมัติและเผยแพร่ราคา? ต้องตรวจสอบรหัส ชื่อ และวันที่มีผลแล้ว",
                        )
                      )
                        mutate(
                          () => request("admin/imports/approve", { id: r.id }),
                          "อนุมัติเวอร์ชันราคาแล้ว",
                        );
                    }}
                  >
                    อนุมัติและเผยแพร่
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {section === "appointments" ? (
                    <>
                      <th>เลขนัดหมาย</th>
                      <th>เวลา</th>
                      <th>สถานะ</th>
                      <th>ดำเนินการ</th>
                    </>
                  ) : section === "packages" ? (
                    <>
                      <th>แพ็กเกจ</th>
                      <th>เวอร์ชัน</th>
                      <th>ราคา</th>
                      <th>สถานะ</th>
                      <th>ดำเนินการ</th>
                    </>
                  ) : section === "organizations" ? (
                    <>
                      <th>องค์กร</th>
                      <th>สถานะ</th>
                      <th>สร้างเมื่อ</th>
                    </>
                  ) : ["billing", "quotations"].includes(section) ? (
                    <>
                      <th>รหัสใบประมาณการ</th>
                      <th>ประมาณการ</th>
                      <th>อนุมัติ</th>
                      <th>เรียกเก็บจริง</th>
                      <th>รับชำระ</th>
                    </>
                  ) : section === "reports" ? (
                    <>
                      <th>สถานะนัดหมาย</th>
                      <th>จำนวน (สร้างใน 30 วัน)</th>
                    </>
                  ) : section === "audit" ? (
                    <>
                      <th>เวลา</th>
                      <th>การดำเนินการ</th>
                      <th>ทรัพยากร</th>
                      <th>Correlation ID</th>
                    </>
                  ) : (
                    <>
                      <th>คำขอ</th>
                      <th>ประเภท</th>
                      <th>สถานะ</th>
                      <th>วันที่</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => (
                  <tr key={String(r.id ?? i)}>
                    {section === "appointments" ? (
                      <>
                        <td>
                          <strong>{String(r.reference)}</strong>
                        </td>
                        <td>
                          {dateTime((r.slot as { startsAt: string }).startsAt)}
                        </td>
                        <td>
                          <StatusBadge status={String(r.status)} />
                        </td>
                        <td>
                          <div className="actions">
                            {(r.status === "confirmed"
                              ? ["checked_in", "no_show", "cancelled"]
                              : r.status === "checked_in"
                                ? ["in_service"]
                                : r.status === "in_service"
                                  ? ["completed"]
                                  : []
                            ).map((status) => (
                              <button
                                className="button secondary small"
                                key={status}
                                disabled={busy}
                                onClick={() => {
                                  const reason =
                                    status === "cancelled"
                                      ? window.prompt("เหตุผลการยกเลิก")
                                      : undefined;
                                  if (status === "cancelled" && !reason) return;
                                  mutate(() =>
                                    request("admin/bookings/status", {
                                      id: r.id,
                                      status,
                                      reason,
                                    }),
                                  );
                                }}
                              >
                                {status === "checked_in"
                                  ? "เช็กอิน"
                                  : status === "no_show"
                                    ? "ไม่มาตามนัด"
                                    : status === "in_service"
                                      ? "เริ่มบริการ"
                                      : status === "completed"
                                        ? "เสร็จสิ้น"
                                        : "ยกเลิก"}
                              </button>
                            ))}
                          </div>
                        </td>
                      </>
                    ) : section === "packages" ? (
                      <>
                        <td>
                          <strong>{String(r.name)}</strong>
                          <div className="muted">{String(r.key)}</div>
                        </td>
                        <td>{String(r.version)}</td>
                        <td>{money(String(r.fixedPrice))}</td>
                        <td>
                          <StatusBadge status={String(r.status)} />
                        </td>
                        <td>
                          {r.status === "draft" && (
                            <button
                              className="button secondary small"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "ยืนยันการอนุมัติเงื่อนไข ราคา และรายการตรวจสำหรับเผยแพร่?",
                                  )
                                )
                                  mutate(() =>
                                    request("admin/packages/status", {
                                      id: r.id,
                                      status: "published",
                                    }),
                                  );
                              }}
                            >
                              อนุมัติเผยแพร่
                            </button>
                          )}
                          {r.status !== "archived" && (
                            <button
                              className="button ghost small"
                              disabled={busy}
                              onClick={() =>
                                mutate(() =>
                                  request("admin/packages/status", {
                                    id: r.id,
                                    status: "archived",
                                  }),
                                )
                              }
                            >
                              เก็บถาวร
                            </button>
                          )}
                        </td>
                      </>
                    ) : section === "organizations" ? (
                      <>
                        <td>{String(r.name)}</td>
                        <td>
                          <StatusBadge status={String(r.status)} />
                        </td>
                        <td>{dateTime(String(r.createdAt))}</td>
                      </>
                    ) : ["billing", "quotations"].includes(section) ? (
                      <>
                        <td>{String(r.id).slice(-12)}</td>
                        <td>{money(String(r.estimated))}</td>
                        <td>
                          {r.approved
                            ? money(String(r.approved))
                            : "ยังไม่อนุมัติ"}
                        </td>
                        <td>{r.billed ? money(String(r.billed)) : "—"}</td>
                        <td>{r.paid ? money(String(r.paid)) : "—"}</td>
                      </>
                    ) : section === "reports" ? (
                      <>
                        <td>
                          <StatusBadge status={String(r.status)} />
                        </td>
                        <td>{(r._count as { _all: number })._all}</td>
                      </>
                    ) : section === "audit" ? (
                      <>
                        <td>{dateTime(String(r.createdAt))}</td>
                        <td>{String(r.action)}</td>
                        <td>{String(r.resourceId)}</td>
                        <td>{String(r.correlationId)}</td>
                      </>
                    ) : (
                      <>
                        <td>{String(r.id)}</td>
                        <td>{String(r.type)}</td>
                        <td>
                          <StatusBadge status={String(r.status)} />
                        </td>
                        <td>{dateTime(String(r.createdAt))}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
