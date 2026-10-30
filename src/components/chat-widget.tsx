"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { request } from "@/lib/client";
type Message = {
  id: string;
  sequence: number;
  authorType: string;
  text: string;
  citations: { id: string; title: string; version: number; href: string }[];
};
type Thread = {
  id: string;
  status: string;
  typing: boolean;
  queuePosition: number;
  lastSequence: number;
  messages: Message[];
};
type Config = {
  enabled: boolean;
  notice: string;
  noticeText: string;
  noticeVersion: string;
  retentionDays: number;
  aiEnabled: boolean;
  departments: { id: string; name: string }[];
  questions: { id: string; question: string }[];
};
export function ChatWidget() {
  const path = usePathname();
  const [config, setConfig] = useState<Config | null>(null),
    [open, setOpen] = useState(false),
    [thread, setThread] = useState<Thread | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [department, setDepartment] = useState("health_check"),
    [ack, setAck] = useState(false),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const cursor = useRef(0),
    pending = useRef<{ text: string; id: string } | null>(null);
  const hidden =
    path.startsWith("/auth/") ||
    ["/login", "/invite", "/forgot-password", "/reset-password"].includes(path);
  useEffect(() => {
    request<Config>("chat/config")
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);
  function merge(t: Thread) {
    setThread(t);
    setMessages((old) =>
      [...new Map([...old, ...t.messages].map((m) => [m.id, m])).values()].sort(
        (a, b) => a.sequence - b.sequence,
      ),
    );
    cursor.current =
      t.messages.length >= 100
        ? t.messages[t.messages.length - 1].sequence
        : t.lastSequence;
  }
  const threadId = thread?.id,
    threadStatus = thread?.status;
  useEffect(() => {
    if (!open || !threadId || error || threadStatus === "closed") return;
    let stopped = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const t = await request<Thread>(
          "chat/messages?conversationId=" +
            threadId +
            "&after=" +
            cursor.current,
        );
        if (!stopped) merge(t);
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    const timer = setInterval(poll, 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [open, threadId, threadStatus, error]);
  useEffect(() => {
    if (!open) return;
    const resize = () =>
      document.documentElement.style.setProperty(
        "--chat-view-height",
        (window.visualViewport?.height ?? innerHeight) + "px",
      );
    resize();
    visualViewport?.addEventListener("resize", resize);
    return () => {
      visualViewport?.removeEventListener("resize", resize);
      document.documentElement.style.removeProperty("--chat-view-height");
    };
  }, [open]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send(value: string) {
    await run(async () => {
      const p =
        pending.current?.text === value
          ? pending.current
          : { text: value, id: crypto.randomUUID() };
      pending.current = p;
      const t = await request<Thread>("chat/messages", {
        conversationId: thread!.id,
        clientId: p.id,
        text: value,
      });
      merge(t);
      setText("");
      pending.current = null;
    });
  }
  if (hidden || !config?.enabled) return null;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="chat-launcher" aria-label="เปิด PDH Health Chat">
          <MessageCircle size={22} />
          <span>สอบถามข้อมูล</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="chat-overlay" />
        <Dialog.Content
          className="chat-panel"
          aria-describedby="chat-description"
        >
          <header>
            <Dialog.Title>PDH Health Chat</Dialog.Title>
            <Dialog.Close asChild>
              <button className="button ghost" aria-label="ปิดแชต">
                <X />
              </button>
            </Dialog.Close>
          </header>
          <Dialog.Description id="chat-description">
            {config.notice}
          </Dialog.Description>
          {error && (
            <p className="field-error" role="alert">
              {error}{" "}
              <button
                onClick={() => {
                  setThread(null);
                  setMessages([]);
                  cursor.current = 0;
                  setError("");
                }}
              >
                เริ่มใหม่
              </button>
            </p>
          )}
          {!thread ? (
            <div className="stack chat-consent">
              <p>
                สวัสดีค่ะ สอบถามแพ็กเกจ การเตรียมตัว และขั้นตอนรับบริการได้
                หากต้องการติดต่อเจ้าหน้าที่ แจ้งได้ทันที
              </p>
              <p className="chat-policy">{config.noticeText}</p>
              <p>เก็บประวัติตามประกาศที่อนุมัติ {config.retentionDays} วัน</p>
              <label className="field">
                หน่วยงาน
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  {config.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                รับทราบประกาศแชตและการส่งต่อเจ้าหน้าที่
              </label>
              <button
                className="button"
                disabled={!ack || busy}
                onClick={() =>
                  run(async () => {
                    await request("auth/guest", {});
                    cursor.current = 0;
                    setMessages([]);
                    merge(
                      await request<Thread>("chat/sessions", {
                        departmentId: department,
                        noticeVersion: config.noticeVersion,
                        acknowledged: true,
                      }),
                    );
                  })
                }
              >
                เริ่มสนทนา
              </button>
            </div>
          ) : (
            <>
              <p role="status">
                {thread.status === "bot"
                  ? config.aiEnabled
                    ? "ผู้ช่วยข้อมูลจากแหล่งที่อนุมัติ"
                    : "ค้นหา FAQ ที่อนุมัติ"
                  : thread.status === "queued"
                    ? "รอเจ้าหน้าที่ · ลำดับคิว " + thread.queuePosition
                    : thread.status === "active"
                      ? "เจ้าหน้าที่รับช่วงแล้ว"
                      : "จบบทสนทนาแล้ว"}
              </p>
              <div
                className="chat-messages"
                role="log"
                aria-label="ข้อความสนทนา"
                aria-live="polite"
              >
                {messages.map((m) => (
                  <article
                    className={"chat-message chat-" + m.authorType}
                    key={m.id}
                  >
                    <strong>
                      {m.authorType === "user"
                        ? "คุณ"
                        : m.authorType === "staff"
                          ? "เจ้าหน้าที่"
                          : m.authorType === "assistant"
                            ? "ผู้ช่วยข้อมูล"
                            : "ระบบ"}
                    </strong>
                    <p>{m.text}</p>
                    {m.citations.map((c) => (
                      <a
                        key={c.id}
                        href={c.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        อ้างอิง: {c.title} รุ่น {c.version}
                      </a>
                    ))}
                  </article>
                ))}
                {(busy || thread.typing) && (
                  <p role="status">{thread.status === "active" ? "เจ้าหน้าที่กำลังพิมพ์…" : "กำลังค้นหาข้อมูล…"}</p>
                )}
              </div>
              {!messages.length && (
                <div className="chat-suggestions">
                  {config.questions.map((q) => (
                    <button
                      className="button secondary"
                      key={q.id}
                      onClick={() => send(q.question)}
                      disabled={busy}
                    >
                      {q.question}
                    </button>
                  ))}
                </div>
              )}
              {!["closed", "resolved"].includes(thread.status) ? (
                <>
                  <form
                    className="chat-compose"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (text.trim()) void send(text.trim());
                    }}
                  >
                    <label className="sr-only" htmlFor="chat-message">
                      ข้อความถึงผู้ช่วย/เจ้าหน้าที่
                    </label>
                    <textarea
                      id="chat-message"
                      value={text}
                      maxLength={2000}
                      rows={2}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="ไม่ส่งเลขบัตร ผลตรวจ หรือข้อมูลสุขภาพส่วนตัว"
                    />
                    <button className="button" disabled={busy || !text.trim()}>
                      ส่ง
                    </button>
                  </form>
                  <div className="chat-actions">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        run(async () =>
                          merge(
                            await request<Thread>("chat/handoff", {
                              conversationId: thread.id,
                            }),
                          ),
                        )
                      }
                    >
                      ขอคุยกับเจ้าหน้าที่
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        run(async () => {
                          await request("chat/close", {
                            conversationId: thread.id,
                          });
                          setThread({ ...thread, status: "closed" });
                        })
                      }
                    >
                      จบแชต
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label className="field">
                    ประเมินความพึงพอใจ
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value)
                          void run(async () => {
                            await request("chat/feedback", {
                              conversationId: thread.id,
                              rating: Number(e.target.value),
                            });
                          });
                      }}
                    >
                      <option value="">เลือกคะแนน</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button"
                    onClick={() => {
                      setThread(null);
                      setMessages([]);
                      cursor.current = 0;
                    }}
                  >
                    เริ่มบทสนทนาใหม่
                  </button>
                </>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
