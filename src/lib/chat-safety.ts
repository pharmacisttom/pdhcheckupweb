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
    /ยา(?!บาล)|\b\d{13}\b|\b0[689]\d{8}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|ผลตรวจ|ค่าเลือด|ผมเป็น|ฉันเป็น|ผมมีอาการ|ฉันมีอาการ|ตั้งครรภ์|หยุดยา|เพิ่มยา|ปรับยา|กินยา|ทานยา|วินิจฉัย/i.test(
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
  const matches = records.filter((r) => {
    const words = Array.isArray(r.keywords)
      ? r.keywords.filter(
          (w): w is string =>
            typeof w === "string" && normalizeChat(w).length >= 2,
        )
      : [];
    return (
      normalizeChat(r.question) === input ||
      new Set(words.filter((w) => input.includes(normalizeChat(w)))).size >= 2
    );
  });
  if (!matches.length) return { matches: [], reason: "insufficient_evidence" };
  if (new Set(matches.map((r) => normalizeChat(r.answer))).size > 1)
    return { matches: [], reason: "conflicting_evidence" };
  return { matches: matches.slice(0, 3), reason: "approved_extract" };
}
export function safeKnowledge(text: string) {
  return !/ignore.{0,30}instructions|system prompt|ข้ามกฎ|ลืมคำสั่ง|api.?key|exfiltrat/i.test(
    text,
  );
}
