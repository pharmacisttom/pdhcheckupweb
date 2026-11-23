import type { Question, RiskRule } from "./domain";
import { intakeReusePlan } from "./intake-reuse";

/** Review suggestions only: never remove an ID, rewrite a rule or publish content. */
export function questionnaireInventory(
  questions: Question[],
  rules: RiskRule[],
) {
  const labels = new Map<string, string[]>();
  for (const q of questions) {
    const label = q.label.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    labels.set(label, [...(labels.get(label) ?? []), q.id]);
  }
  return {
    answerIds: questions.map((q) => q.id),
    intakeReuse: intakeReusePlan(questions, rules),
    duplicateLabelCandidates: [...labels.values()].filter(
      (ids) => ids.length > 1,
    ),
    complexQuestionCandidates: questions
      .filter((q) => q.label.length > 160 || (q.options?.length ?? 0) > 10)
      .map((q) => q.id),
  };
}

export function proposeRc03Questionnaire(
  questions: Question[],
  rules: RiskRule[],
) {
  if (questions.some((q) => q.id === "snoring_history"))
    throw new Error("มีรหัส snoring_history แล้ว กรุณาให้แพทย์ตรวจฉบับเดิม");
  return {
    questions: [
      ...structuredClone(questions),
      {
        id: "snoring_history",
        label: "ท่านมีประวัตินอนกรนหรือไม่",
        type: "single" as const,
        options: ["yes", "no", "unknown"],
        required: false,
        translations: {
          th: {
            label: "ท่านมีประวัตินอนกรนหรือไม่",
            options: { yes: "มี", no: "ไม่มี", unknown: "ไม่ทราบ" },
          },
          en: {
            label: "Do you have a history of snoring?",
            options: { yes: "Yes", no: "No", unknown: "Unknown" },
          },
        },
      },
    ],
    rules: structuredClone(rules),
  };
}
