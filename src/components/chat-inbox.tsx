"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { request } from "@/lib/client";
type Message = {
  id: string;
  sequence: number;
  authorType: string;
  text: string;
};
type Row = {
  id: string;
  status: string;
  departmentId: string;
  handoffReason: string | null;
};
type Thread = Row & {
  ownAgentId: string;
  assignedAgentId: string | null;
  messages: Message[];
  agents: { id: string; user: { name: string } }[];
  lastSequence: number;
};
const labels: Record<string, string> = {
  bot: "ผู้ช่วยข้อมูล",
  queued: "รอเจ้าหน้าที่",
  active: "กำลังสนทนา",
  resolved: "แก้ไขแล้ว",
  closed: "ปิดแล้ว",
};
export function ChatInbox() {
  const [rows, setRows] = useState<Row[]>([]),
    [thread, setThread] = useState<Thread | null>(null),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [note, setNote] = useState(false),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [queued, setQueued] = useState(0),
    [departments, setDepartments] = useState<{ id: string; name: string }[]>(
      [],
    ),
    [target, setTarget] = useState("");
  const [canned, setCanned] = useState<
    { id: string; question: string; answer: string }[]
  >([]);
  const cannedDepartment = thread?.departmentId;
  useEffect(() => {
    if (!cannedDepartment) {
      setCanned([]);
      return;
    }
    let cancelled = false;
    request<{ id: string; question: string; answer: string }[]>(
      "admin/chat/canned?departmentId=" + encodeURIComponent(cannedDepartment),
    )
      .then((v) => {
        if (!cancelled) setCanned(v);
      })
      .catch(() => {
        if (!cancelled) setCanned([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cannedDepartment]);
  const typingAt = useRef(0);
  const pending = useRef<{ text: string; action: string; id: string } | null>(
    null,
  );
  useEffect(() => {
    request<{ id: string; name: string }[]>("admin/chat/departments")
      .then(setDepartments)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (document.hidden) return;
      try {
        const data = await request<{
          rows: Row[];
          total: number;
          queued: number;
        }>("admin/chat/conversations?page=" + page);
        if (!cancelled) {
          setRows(data.rows);
          setTotal(data.total);
          setQueued(data.queued);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    void poll();
    const timer = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [page]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    let cursor = 0;
    async function poll() {
      if (document.hidden) return;
      try {
        const t = await request<Thread>(
          "admin/chat/conversations/" + selected + "?after=" + cursor,
        );
        if (cancelled) return;
        setThread((old) => ({
          ...t,
          messages: [
            ...new Map(
              [...(old?.id === t.id ? old.messages : []), ...t.messages].map(
                (m) => [m.id, m],
              ),
            ).values(),
          ].sort((a, b) => a.sequence - b.sequence),
        }));
        cursor =
          t.messages.length >= 100
            ? t.messages[t.messages.length - 1].sequence
            : t.lastSequence;
      } catch (e) {
        if (!cancelled) {
          setThread(null);
          setError((e as Error).message);
        }
      }
    }
    void poll();
    const timer = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected]);
  async function act(action: string, data: Record<string, unknown> = {}) {
    if (!thread) return;
    setBusy(true);
    setError("");
    try {
      await request(
        "admin/chat/conversations/" + thread.id + "/" + action,
        data,
      );
      const fresh = await request<Thread>(
        "admin/chat/conversations/" + thread.id,
      );
      setThread(fresh);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="stack">
      <h1>ศูนย์สนทนา PDH Health Chat</h1>
      <nav className="chat-actions">
        <Link href="/admin/chat/knowledge">ฐานความรู้</Link>
        <Link href="/admin/chat/settings">ตั้งค่าและผู้รับผิดชอบ</Link>
        <Link href="/admin/chat/reports">รายงาน</Link>
      </nav>
      <p role="status">รอเจ้าหน้าที่ {queued} รายการ</p>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="chat-inbox">
        <aside className="stack" aria-label="รายการสนทนา">
          {rows.map((r) => (
            <button
              className="button secondary"
              key={r.id}
              aria-pressed={selected === r.id}
              onClick={() => {
                setSelected(r.id);
                setThread(null);
                setText("");
                pending.current = null;
                setError("");
              }}
            >
              {labels[r.status] ?? r.status} ·{" "}
              {departments.find((d) => d.id === r.departmentId)?.name ??
                r.departmentId}
              <small>{r.id.slice(-8)}</small>
            </button>
          ))}
          {!rows.length && <p>ยังไม่มีบทสนทนาในหน่วยงานที่คุณมีสิทธิ์</p>}
          <div className="chat-actions">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              ก่อนหน้า
            </button>
            <span>{page}</span>
            <button
              disabled={page * 25 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              ถัดไป
            </button>
          </div>
        </aside>
        <div className="stack">
          {thread ? (
            <>
              <h2>{labels[thread.status] ?? thread.status}</h2>
              <label className="field">
                ผู้รับผิดชอบ
                <select
                  value={thread.assignedAgentId ?? ""}
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.value)
                      void act("assign", { agentId: e.target.value }).catch(
                        () => {},
                      );
                  }}
                >
                  <option value="">ยังไม่มอบหมาย</option>
                  {thread.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.user.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button"
                disabled={
                  busy || ["closed", "resolved"].includes(thread.status)
                }
                onClick={() =>
                  void act("assign", { agentId: thread.ownAgentId }).catch(
                    () => {},
                  )
                }
              >
                รับบทสนทนา
              </button>
              <div className="chat-messages" role="log" aria-live="polite">
                {thread.messages.map((m) => (
                  <article
                    key={m.id}
                    className={"chat-message chat-" + m.authorType}
                  >
                    <strong>
                      {m.authorType === "note"
                        ? "บันทึกภายใน (ผู้ใช้ไม่เห็น)"
                        : m.authorType === "user"
                          ? "ผู้ใช้บริการ"
                          : m.authorType === "staff"
                            ? "เจ้าหน้าที่"
                            : "ระบบ/ผู้ช่วยข้อมูล"}
                    </strong>
                    <p>{m.text}</p>
                  </article>
                ))}
              </div>
              <label className="field">
                คำตอบสำเร็จรูปที่เผยแพร่แล้ว
                <select
                  value=""
                  onChange={(e) => {
                    const v = canned.find((v) => v.id === e.target.value);
                    if (v) {
                      setText(v.answer.slice(0, 2000));
                      setNote(false);
                    }
                  }}
                >
                  <option value="">เลือกข้อความเพื่อทบทวนก่อนส่ง</option>
                  {canned.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.question}
                    </option>
                  ))}
                </select>
              </label>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const action = note ? "note" : "reply";
                  if (
                    !pending.current ||
                    pending.current.text !== text ||
                    pending.current.action !== action
                  )
                    pending.current = { text, action, id: crypto.randomUUID() };
                  void act(action, { text, clientId: pending.current.id })
                    .then(() => {
                      setText("");
                      pending.current = null;
                    })
                    .catch(() => {});
                }}
              >
                <label className="field">
                  ข้อความ
                  <textarea
                    value={text}
                    maxLength={2000}
                    rows={3}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (
                        !note &&
                        thread.assignedAgentId === thread.ownAgentId &&
                        Date.now() - typingAt.current > 3000
                      ) {
                        typingAt.current = Date.now();
                        void request(
                          "admin/chat/conversations/" + thread.id + "/typing",
                          {},
                        ).catch(() => {});
                      }
                    }}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={note}
                    onChange={(e) => setNote(e.target.checked)}
                  />{" "}
                  บันทึกภายใน
                </label>
                <button
                  className="button"
                  disabled={
                    busy ||
                    !text.trim() ||
                    thread.status !== "active" ||
                    thread.assignedAgentId !== thread.ownAgentId
                  }
                >
                  {note ? "บันทึกภายใน" : "ส่งข้อความ"}
                </button>
              </form>
              <div className="chat-actions">
                {["resolve", "close", "reopen"].map((action) => (
                  <button
                    key={action}
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void act(action).catch(() => {})}
                  >
                    {action === "resolve"
                      ? "แก้ไขแล้ว"
                      : action === "close"
                        ? "ปิดเรื่อง"
                        : "เปิดเรื่องอีกครั้ง"}
                  </button>
                ))}
              </div>
              <label className="field">
                โอนหน่วยงาน
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">เลือกหน่วยงาน</option>
                  {departments
                    .filter((d) => d.id !== thread.departmentId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
              <button
                className="button secondary"
                disabled={busy || !target}
                onClick={() =>
                  void act("transfer", { departmentId: target })
                    .then(() => {
                      setSelected("");
                      setThread(null);
                    })
                    .catch(() => {})
                }
              >
                ส่งต่อหน่วยงาน
              </button>
            </>
          ) : (
            <p>เลือกรายการเพื่ออ่านและรับบทสนทนา</p>
          )}
        </div>
      </div>
    </section>
  );
}
