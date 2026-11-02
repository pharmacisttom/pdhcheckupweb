export const CHAT_NOTICE =
  "ระบบใช้ FAQ และอาจใช้ AI ช่วยค้นข้อมูล คำตอบอาจผิดพลาด ไม่ใช่คำแนะนำทางการแพทย์เฉพาะบุคคล กรุณาไม่ส่งเลขบัตรประชาชน ผลตรวจ หรือข้อมูลสุขภาพที่ไม่จำเป็น";
export const EMERGENCY_NOTICE =
  "หากมีเหตุฉุกเฉิน กรุณาโทร 1669 หรือเข้ารับการดูแลฉุกเฉินทันที ไม่ควรรอคำตอบจากแชต";
export function normalizeChat(s: string) {
  return s
    .normalize("NFKC")
    .toLocaleLowerCase("th")
    .replace(/\s+/g, " ")
    .trim();
}
export function chatSafetyReason(text: string): string | null {
  if (
    /ฉุกเฉิน|หมดสติ|หายใจไม่ออก|เลือดออกมาก|เจ็บหน้าอก|cannot breathe|unconscious/i.test(
      text,
    )
  )
    return "emergency";
  if (
    /ignore.{0,30}instructions|system prompt|ข้ามกฎ|ลืมคำสั่ง|api.?key|เปิดเผย.{0,12}(รหัส|secret)|exfiltrat/i.test(
      text,
    )
  )
    return "safety";
  if (
    /ยา(?!บาล)|\b\d{13}\b|\b0[689]\d{8}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|ผลตรวจของ(ผม|ฉัน|เรา|ตนเอง)|(ขอ|ดู|เช็ค|ตรวจ)ผลตรวจ(ของ)?|ผลตรวจ.*ออกหรือยัง|ค่าเลือด|ผมเป็น|ฉันเป็น|ผมมีอาการ|ฉันมีอาการ|ตั้งครรภ์|หยุดยา|เพิ่มยา|ปรับยา|กินยา|ทานยา|วินิจฉัย/i.test(
      text,
    )
  )
    return "personal_health";
  if (
    /ร้องเรียน|ไม่พอใจ|จ่ายเงิน|ชำระเงินไม่ได้|จองไม่ได้|เลื่อนนัด|ยกเลิกนัด/i.test(
      text,
    )
  )
    return "service_issue";
  return null;
}
export type Evidence = {
  id: string;
  question: string;
  answer: string;
  keywords: unknown;
};
export function relevantEvidence<T extends Evidence>(
  text: string,
  records: T[],
): { matches: T[]; reason: string } {
  const input = normalizeChat(text);
  if (!input) return { matches: [], reason: "insufficient_evidence" };

  const scored: { record: T; score: number }[] = [];

  for (const r of records) {
    const qNorm = normalizeChat(r.question);
    const words = Array.isArray(r.keywords)
      ? r.keywords.filter(
          (w): w is string =>
            typeof w === "string" && normalizeChat(w).length >= 2,
        )
      : [];
    const matchedWords = new Set(
      words.filter((w) => input.includes(normalizeChat(w))),
    );
    const distinctWords = matchedWords.size;
    const isExact = qNorm === input;
    const isPartial =
      (input.length >= 6 && qNorm.includes(input)) ||
      (qNorm.length >= 6 && input.includes(qNorm));

    // Must be exact question match, substantial question match, or have at least 2 distinct approved keywords
    if (!isExact && !isPartial && distinctWords < 2) continue;

    let score = distinctWords * 100;
    if (isExact) {
      score += 1000;
    } else if (isPartial) {
      score += 400;
    }

    scored.push({ record: r, score });
  }

  if (!scored.length) return { matches: [], reason: "insufficient_evidence" };

  // Sort by relevance score descending
  scored.sort((a, b) => b.score - a.score);

  const topScore = scored[0].score;
  const topMatches = scored
    .filter((s) => s.score === topScore)
    .map((s) => s.record);

  // If tied top matches have conflicting answers
  if (new Set(topMatches.map((r) => normalizeChat(r.answer))).size > 1) {
    return { matches: [], reason: "conflicting_evidence" };
  }

  // If top candidate is clear or candidates share same answer
  const dominant = scored.length === 1 || scored[0].score >= scored[1].score * 1.5;
  if (dominant) {
    return { matches: [scored[0].record], reason: "approved_extract" };
  }

  // If closely scored candidates share different answers
  const topCandidates = scored.slice(0, 3).map((s) => s.record);
  if (new Set(topCandidates.map((r) => normalizeChat(r.answer))).size > 1) {
    return { matches: [], reason: "conflicting_evidence" };
  }

  return { matches: topCandidates, reason: "approved_extract" };
}
export function safeKnowledge(text: string) {
  return !/ignore.{0,30}instructions|system prompt|ข้ามกฎ|ลืมคำสั่ง|api.?key|exfiltrat/i.test(
    text,
  );
}

