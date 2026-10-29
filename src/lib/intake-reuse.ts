import type { Question, RiskRule } from "./domain";
export type IntakeReuseSource =
  "medicalHistory" | "currentMedication" | "allergies" | "family";
export type IntakeReusePlan = Record<string, IntakeReuseSource>;
type Intake = {
  medicalHistory?: string;
  currentMedication?: string;
  allergies?: string;
  familyNcdStatus?: string;
  familyNcdEntries?: { disease: string }[];
};
// Exact definitions only. Never guess from labels, translated text or patient free text.
export function intakeReusePlan(
  questions: Question[],
  rules: RiskRule[],
): IntakeReusePlan {
  const blocked = new Set([
    ...rules.map((r) => r.field),
    ...questions.flatMap((q) => (q.showIf ? [q.showIf.field] : [])),
  ]);
  const definitions = [
    ["medication_details", "ยาที่ใช้ประจำ", "currentMedication"],
    ["allergy", "ประวัติแพ้ยา (ถ้ามี)", "allergies"],
    ["other", "โรคประจำตัวหรือข้อมูลอื่นที่ต้องการแจ้ง", "medicalHistory"],
  ] as const;
  const plan: IntakeReusePlan = {};
  for (const q of questions) {
    if (blocked.has(q.id)) continue;
    const match = definitions.find(
      ([id, label]) => q.id === id && q.label === label,
    );
    const expectedCondition =
      q.id === "medication_details"
        ? q.showIf?.field === "medication" && q.showIf.equals === "มี"
        : !q.showIf;
    if (match && q.type === "text" && !q.options?.length && expectedCondition)
      plan[q.id] = match[2];
    if (
      q.id === "family" &&
      q.label === "ประวัติโรคไม่ติดต่อในญาติสายตรง" &&
      q.type === "multiple" &&
      !q.showIf &&
      JSON.stringify(q.options) ===
        JSON.stringify([
          "เบาหวาน",
          "ความดันโลหิตสูง",
          "โรคหัวใจ",
          "ไม่มี",
          "ไม่ทราบ",
        ])
    )
      plan[q.id] = "family";
  }
  return plan;
}
export function intakeReuseValue(
  source: IntakeReuseSource,
  person: Intake,
): string | string[] | undefined {
  if (source !== "family") {
    const value = person[source] ?? "";
    // Keep the separate approved text question if the existing API limit cannot represent it.
    return value.length <= 1000 ? value : undefined;
  }
  if (person.familyNcdStatus === "no") return ["ไม่มี"];
  if (person.familyNcdStatus === "unknown") return ["ไม่ทราบ"];
  if (person.familyNcdStatus !== "yes" || !person.familyNcdEntries?.length)
    return undefined;
  const labels: Record<string, string> = {
    diabetes: "เบาหวาน",
    hypertension: "ความดันโลหิตสูง",
    heart_disease: "โรคหัวใจ",
  };
  if (person.familyNcdEntries.some((e) => !labels[e.disease])) return undefined;
  return [...new Set(person.familyNcdEntries.map((e) => labels[e.disease]))];
}

// Presentation only: diagnosis answers still come from the approved questionnaire.
export function additionalHistoryCodes(questions: Question[]): string[] {
  const definitions = [
    ["diabetes", "เบาหวาน", "diabetes"],
    ["hypertension", "ความดันโลหิตสูง", "hypertension"],
    ["dyslipidemia", "ไขมันในเลือดสูง", "dyslipidemia"],
    ["kidney", "โรคไตเรื้อรัง", "kidney_disease"],
    ["heart", "โรคหัวใจและหลอดเลือด", "heart_disease"],
  ] as const;
  return definitions
    .filter(([id, name]) =>
      questions.some(
        (q) =>
          q.id === id &&
          q.label === "เคยได้รับการวินิจฉัย" + name + "หรือไม่" &&
          q.type === "single" &&
          JSON.stringify(q.options) ===
            JSON.stringify(["ไม่เคย", "เคย", "ไม่ทราบ"]),
      ),
    )
    .map(([, , code]) => code);
}
