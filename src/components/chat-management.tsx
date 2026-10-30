"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { request } from "@/lib/client";
type Department = {
  id: string;
  name: string;
  active: boolean;
  agents: { id: string; active: boolean; user: { id: string; name: string } }[];
};
type Settings = {
  enabled: boolean;
  aiEnabled: boolean;
  handoffEnabled: boolean;
  noticeVersion: string | null;
  noticeText: string | null;
  retentionDays: number | null;
  monthlyTokenLimit: number;
  monthlyRequestLimit: number;
  monthlyBudgetUsd: string;
  slaMinutes: number;
  canManageSettings: boolean;
  canApprovePolicy: boolean;
  policyApprovedAt: string | null;
  policyFingerprint: string;
  environmentEnabled: boolean;
  provider: string;
  departments: Department[];
  users: { id: string; name: string }[];
};
type Version = {
  id: string;
  question: string;
  answer: string;
  status: string;
  version: number;
  knowledgeId: string;
  keywords: string[];
  startsAt: string;
  expiresAt: string;
  authorId: string;
  reviewerId: string | null;
  _count: { citations: number };
  knowledge: {
    departmentId: string;
    topicKey: string;
    category: string;
    clinical: boolean;
    visibility: string;
  };
};
export function ChatManagement({
  mode,
}: {
  mode: "settings" | "knowledge" | "reports";
}) {
  const [settings, setSettings] = useState<Settings | null>(null),
    [versions, setVersions] = useState<Version[]>([]),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [editing, setEditing] = useState<Version | null>(null);
  const localDate = (v: string) => {
    const d = new Date(v);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  async function load() {
    if (mode === "settings")
      setSettings(await request<Settings>("admin/chat/settings"));
    if (mode === "knowledge")
      setVersions(await request<Version[]>("admin/chat/knowledge"));
  }
  useEffect(() => {
    let disposed = false;
    const endpoint =
      mode === "settings"
        ? "admin/chat/settings"
        : mode === "knowledge"
          ? "admin/chat/knowledge"
          : null;
    if (endpoint)
      request<Settings | Version[]>(endpoint)
        .then((data) => {
          if (!disposed) {
            if (mode === "settings") setSettings(data as Settings);
            else setVersions(data as Version[]);
          }
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        });
    return () => {
      disposed = true;
    };
  }, [mode]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await fn();
      setStatus("บันทึกเรียบร้อย");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportReport(format: "csv" | "xlsx") {
    if (!report) return;
    const rows = Object.entries(report).map(([key, value]) => [
      key,
      typeof value === "object" ? JSON.stringify(value) : String(value ?? ""),
    ]);
    const safe = (v: string) => (/^[=+@\-\t\r]/.test(v) ? "'" + v : v);
    let blob: Blob;
    if (format === "xlsx") {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Chat aggregates");
      sheet.addRow(["Metric", "Value"]);
      for (const row of rows) sheet.addRow(row.map(safe));
      sheet.columns = [{ width: 35 }, { width: 100 }];
      blob = new Blob([new Uint8Array(await workbook.xlsx.writeBuffer())], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    } else {
      const quote = (v: string) => '"' + safe(v).replace(/"/g, '""') + '"';
      blob = new Blob(
        [
          "\uFEFF" +
            [["Metric", "Value"], ...rows]
              .map((row) => row.map(quote).join(","))
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      );
    }
    const url = URL.createObjectURL(blob),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "chat-aggregates." + format;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const value = (f: FormData, k: string) => String(f.get(k) ?? "");
  return (
    <section className="stack">
      <Link href="/admin/chat">กลับศูนย์สนทนา</Link>
      <h1>
        {mode === "settings"
          ? "ตั้งค่า Health Chat"
          : mode === "knowledge"
            ? "ฐานความรู้ที่ผ่านการทบทวน"
            : "รายงาน Health Chat"}
      </h1>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {mode === "settings" && settings && (
        <>
          <p>
            Environment: {settings.environmentEnabled ? "เปิด" : "ปิด"} ·
            Provider: {settings.provider} · ประกาศ:{" "}
            {settings.policyApprovedAt ? "อนุมัติแล้ว" : "ยังไม่อนุมัติ"}
          </p>
          <form
            className="stack"
            key={settings.policyFingerprint}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await request("admin/chat/settings", {
                  enabled: f.has("enabled"),
                  aiEnabled: f.has("aiEnabled"),
                  handoffEnabled: f.has("handoffEnabled"),
                  noticeVersion: value(f, "noticeVersion"),
                  noticeText: value(f, "noticeText"),
                  ...Object.fromEntries(
                    [
                      "retentionDays",
                      "monthlyTokenLimit",
                      "monthlyRequestLimit",
                      "monthlyBudgetUsd",
                      "slaMinutes",
                    ].map((k) => [k, Number(f.get(k))]),
                  ),
                });
                await load();
              });
            }}
          >
            <fieldset disabled={!settings.canManageSettings || busy}>
              <legend>การเปิดบริการและนโยบาย</legend>
              {["enabled", "aiEnabled", "handoffEnabled"].map((k) => (
                <label className="check-label" key={k}>
                  <input
                    type="checkbox"
                    name={k}
                    defaultChecked={settings[k as "enabled"]}
                  />
                  {k === "enabled"
                    ? "เปิดบริการแชต"
                    : k === "aiEnabled"
                      ? "เปิดตัวช่วย AI"
                      : "เปิดส่งต่อเจ้าหน้าที่"}
                </label>
              ))}
              <p>
                เมื่อเปลี่ยนประกาศหรืออายุการเก็บข้อมูล
                ให้ปิดบริการและบันทึกก่อน จากนั้นให้ผู้มีสิทธิ์อนุมัติประกาศ
                จึงเปิดบริการอีกครั้ง
              </p>
              <label className="field">
                รุ่นประกาศ
                <input
                  name="noticeVersion"
                  defaultValue={settings.noticeVersion ?? ""}
                  required
                  maxLength={80}
                />
              </label>
              <label className="field">
                ประกาศที่องค์กรอนุมัติ
                <textarea
                  name="noticeText"
                  defaultValue={settings.noticeText ?? ""}
                  required
                  minLength={20}
                  maxLength={3000}
                  rows={6}
                />
              </label>
              {[
                ["retentionDays", "เก็บข้อมูล (วัน)"],
                ["monthlyTokenLimit", "เพดานโทเคนต่อเดือน"],
                ["monthlyRequestLimit", "เพดานเรียก AI ต่อเดือน"],
                ["monthlyBudgetUsd", "งบประมาณ USD ต่อเดือน"],
                ["slaMinutes", "เป้าหมายรับงาน (นาที)"],
              ].map(([k, label]) => (
                <label className="field" key={k}>
                  {label}
                  <input
                    name={k}
                    type="number"
                    step={k === "monthlyBudgetUsd" ? "0.0001" : "1"}
                    min={k === "retentionDays" || k === "slaMinutes" ? 1 : 0}
                    required
                    defaultValue={String(settings[k as "retentionDays"] ?? "")}
                  />
                </label>
              ))}
              <button className="button">บันทึกการตั้งค่า</button>
            </fieldset>
          </form>
          {settings.canApprovePolicy && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await request("admin/chat/policy", {
                    noticeVersion: settings.noticeVersion,
                    fingerprint: settings.policyFingerprint,
                    confirmed: true,
                  });
                  await load();
                });
              }}
            >
              <label className="check-label">
                <input type="checkbox" required />
                ฉันตรวจสอบข้อความประกาศและระยะเวลาเก็บข้อมูลข้างต้นแล้ว
              </label>
              <button
                className="button secondary"
                disabled={busy || !settings.noticeVersion}
              >
                อนุมัติประกาศรุ่นนี้
              </button>
            </form>
          )}
          {settings.canManageSettings && (
            <>
              <h2>หน่วยงานและผู้รับผิดชอบ</h2>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await request("admin/chat/agents", {
                      departmentId: value(f, "departmentId"),
                      userId: value(f, "userId"),
                      active: f.has("active"),
                    });
                    await load();
                  });
                }}
              >
                <label className="field">
                  หน่วยงาน
                  <select name="departmentId">
                    {settings.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  เจ้าหน้าที่ที่ยืนยัน MFA แล้ว
                  <select name="userId">
                    {settings.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input type="checkbox" name="active" defaultChecked />
                  เปิดสิทธิ์ในหน่วยงาน
                </label>
                <button className="button" disabled={busy}>
                  บันทึกผู้รับผิดชอบ
                </button>
              </form>
              {settings.departments.map((d) => (
                <div key={d.id}>
                  <h3>{d.name}</h3>
                  {d.agents.map((a) => (
                    <p key={a.id}>
                      {a.user.name} · {a.active ? "เปิดสิทธิ์" : "ปิดสิทธิ์"}
                    </p>
                  ))}
                </div>
              ))}
            </>
          )}
        </>
      )}
      {mode === "knowledge" && (
        <>
          <form
            key={editing?.id ?? "new-topic"}
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const data = {
                  ...(editing ? { knowledgeId: editing.knowledgeId } : {}),
                  departmentId: value(f, "departmentId"),
                  topicKey: value(f, "topicKey"),
                  category: value(f, "category"),
                  clinical: f.has("clinical"),
                  visibility: editing?.knowledge.visibility ?? "public",
                  question: value(f, "question"),
                  answer: value(f, "answer"),
                  keywords: value(f, "keywords")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  startsAt: new Date(value(f, "startsAt")).toISOString(),
                  expiresAt: new Date(value(f, "expiresAt")).toISOString(),
                };
                const file = f.get("file");
                if (file instanceof File && file.size) {
                  const body = new FormData();
                  body.set("file", file);
                  body.set("metadata", JSON.stringify(data));
                  await request("admin/chat/knowledge/import", body);
                } else await request("admin/chat/knowledge", data);
                await load();
              });
            }}
          >
            <h2>
              {editing
                ? "สร้างรุ่นใหม่จากรุ่น " + editing.version
                : "สร้างแบบร่าง"}
            </h2>
            {editing && (
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(null)}
              >
                เปลี่ยนเป็นหัวข้อใหม่
              </button>
            )}
            {[
              ["departmentId", "รหัสหน่วยงาน เช่น health_check"],
              ["topicKey", "รหัสหัวข้อคงที่"],
              ["category", "หมวดหมู่"],
              ["question", "คำถาม"],
              ["keywords", "คำค้น คั่นด้วยเครื่องหมาย ,"],
            ].map(([k, label]) => (
              <label className="field" key={k}>
                {label}
                <input
                  key={(editing?.id ?? "new") + k}
                  name={k}
                  required
                  defaultValue={
                    editing
                      ? k === "question"
                        ? editing.question
                        : k === "keywords"
                          ? editing.keywords.join(", ")
                          : String(editing.knowledge[k as "topicKey"] ?? "")
                      : ""
                  }
                  readOnly={
                    !!editing && ["departmentId", "topicKey"].includes(k)
                  }
                />
              </label>
            ))}
            <div className="field">
              <label htmlFor="kb-answer">คำตอบ</label>
              <textarea
                id="kb-answer"
                key={editing?.id ?? "new"}
                name="answer"
                rows={5}
                minLength={3}
                defaultValue={editing?.answer ?? ""}
              />
            </div>
            <label>
              <input
                key={editing?.id ?? "new"}
                name="clinical"
                type="checkbox"
                defaultChecked={editing?.knowledge.clinical ?? false}
                onClick={(e) => {
                  if (editing) e.preventDefault();
                }}
              />
              เป็นเนื้อหาสุขภาพ ต้องมีผู้ทบทวนทางคลินิก
            </label>
            <label className="field">
              เริ่มเผยแพร่
              <input
                key={editing?.id ?? "new"}
                type="datetime-local"
                name="startsAt"
                required
                defaultValue={editing ? localDate(editing.startsAt) : undefined}
              />
            </label>
            <label className="field">
              หมดอายุ
              <input
                key={editing?.id ?? "new"}
                type="datetime-local"
                name="expiresAt"
                required
                defaultValue={
                  editing ? localDate(editing.expiresAt) : undefined
                }
              />
            </label>
            <label className="field">
              นำเข้าเอกสารเป็นแบบร่าง (ไม่เกิน 1 MB)
              <input type="file" name="file" accept=".txt,.pdf,.docx" />
            </label>
            <button className="button" disabled={busy}>
              บันทึกแบบร่าง
            </button>
          </form>
          {versions.map((v) => (
            <article className="card stack" key={v.id}>
              <h2>{v.question}</h2>
              <p>
                อ้างอิง {v._count.citations} ครั้ง · ผู้จัดทำ {v.authorId} ·
                ผู้ตรวจสอบ {v.reviewerId ?? "ยังไม่มี"}
              </p>
              <button
                className="button secondary"
                onClick={() => {
                  setEditing(v);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                แก้ไขโดยสร้างรุ่นใหม่
              </button>
              <p>
                รุ่น {v.version} · {v.status} · {v.knowledge.departmentId}
              </p>
              <p style={{ whiteSpace: "pre-wrap" }}>{v.answer}</p>
              <div className="chat-actions">
                {["submit", "approve", "reject", "publish", "archive"].map(
                  (action) => (
                    <button
                      className="button secondary"
                      key={action}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await request(
                            "admin/chat/knowledge/" + v.id + "/" + action,
                            {},
                          );
                          await load();
                        })
                      }
                    >
                      {
                        {
                          submit: "ส่งทบทวน",
                          approve: "อนุมัติ",
                          reject: "ส่งกลับ",
                          publish: "เผยแพร่",
                          archive: "เก็บเข้าคลัง",
                        }[action]
                      }
                    </button>
                  ),
                )}
              </div>
            </article>
          ))}
        </>
      )}
      {mode === "reports" && (
        <>
          <form
            className="chat-actions"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                setReport(
                  await request<Record<string, unknown>>(
                    "admin/chat/reports?" +
                      new URLSearchParams({
                        from: value(f, "from"),
                        to: value(f, "to"),
                      }),
                  ),
                );
              });
            }}
          >
            <label className="field">
              ตั้งแต่
              <input type="date" name="from" required />
            </label>
            <label className="field">
              ถึง
              <input type="date" name="to" required />
            </label>
            <button className="button" disabled={busy}>
              ดูรายงาน
            </button>
          </form>
          {report && (
            <div className="chat-actions">
              <button
                className="button secondary"
                onClick={() => void run(() => exportReport("csv"))}
              >
                ดาวน์โหลด CSV
              </button>
              <button
                className="button secondary"
                onClick={() => void run(() => exportReport("xlsx"))}
              >
                ดาวน์โหลด XLSX
              </button>
            </div>
          )}
          {report && (
            <dl>
              {Object.entries(report).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {typeof v === "object"
                      ? JSON.stringify(v, null, 2)
                      : String(v ?? "ไม่มีข้อมูล")}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </section>
  );
}
