"use client";
import { useEffect, useState } from "react";
import { request } from "@/lib/client";
export function ChatSource() {
  const [data, setData] = useState<{
      question: string;
      answer: string;
      version: number;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      setError("ไม่พบแหล่งอ้างอิง");
      return;
    }
    request<{ question: string; answer: string; version: number }>(
      "chat/source?id=" + encodeURIComponent(id),
    )
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <article className="container stack">
      <h1>แหล่งข้อมูลอ้างอิง</h1>
      {error && <p role="alert">{error}</p>}
      {data ? (
        <>
          <h2>{data.question}</h2>
          <p>รุ่น {data.version}</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{data.answer}</p>
        </>
      ) : (
        !error && <p role="status">กำลังโหลด…</p>
      )}
    </article>
  );
}
