import { expect, it } from "vitest";
import {
  intakeReusePlan,
  intakeReuseValue,
  additionalHistoryCodes,
} from "../../src/lib/intake-reuse";
import type { Question, RiskRule } from "../../src/lib/domain";
const questions: Question[] = [
  { id: "allergy", label: "ประวัติแพ้ยา (ถ้ามี)", type: "text" },
  {
    id: "medication_details",
    label: "ยาที่ใช้ประจำ",
    type: "text",
    required: true,
    showIf: { field: "medication", equals: "มี" },
  },
];
it("reuses only exact known duplicate definitions", () => {
  expect(intakeReusePlan(questions, [])).toEqual({
    allergy: "allergies",
    medication_details: "currentMedication",
  });
  expect(
    intakeReusePlan(
      [{ ...questions[0], label: "Changed approved purpose" }],
      [],
    ),
  ).toEqual({});
  expect(
    intakeReusePlan(
      [{ ...questions[0], type: "single", options: ["yes", "no"] }],
      [],
    ),
  ).toEqual({});
});
it("retains any question used by a rule or another question condition", () => {
  const rule: RiskRule = {
    id: "r",
    field: "allergy",
    equals: "yes",
    decision: "needs_clinical_review",
    reason: "Approved",
  };
  expect(intakeReusePlan(questions, [rule])).not.toHaveProperty("allergy");
  expect(
    intakeReusePlan(
      [
        ...questions,
        {
          id: "followup",
          label: "Follow up",
          type: "text",
          showIf: { field: "allergy", equals: "yes" },
        },
      ],
      [],
    ),
  ).not.toHaveProperty("allergy");
});
it("copies user text exactly and never guesses from free text or truncates", () => {
  expect(
    intakeReuseValue("currentMedication", {
      currentMedication: "Original\ntext",
    }),
  ).toBe("Original\ntext");
  expect(
    intakeReuseValue("medicalHistory", { medicalHistory: "x".repeat(1001) }),
  ).toBeUndefined();
  expect(intakeReuseValue("family", { familyNcdStatus: "unknown" })).toEqual([
    "ไม่ทราบ",
  ]);
  expect(intakeReuseValue("family", { familyNcdStatus: "no" })).toEqual([
    "ไม่มี",
  ]);
  expect(
    intakeReuseValue("family", {
      familyNcdStatus: "yes",
      familyNcdEntries: [{ disease: "diabetes" }, { disease: "diabetes" }],
    }),
  ).toEqual(["เบาหวาน"]);
  expect(
    intakeReuseValue("family", {
      familyNcdStatus: "yes",
      familyNcdEntries: [{ disease: "cancer" }],
    }),
  ).toBeUndefined();
});
it("removes repeated preset choices only for exact approved diagnosis controls", () => {
  const q: Question = {
    id: "diabetes",
    label: "เคยได้รับการวินิจฉัยเบาหวานหรือไม่",
    type: "single",
    options: ["ไม่เคย", "เคย", "ไม่ทราบ"],
  };
  expect(additionalHistoryCodes([q])).toEqual(["diabetes"]);
  expect(
    additionalHistoryCodes([{ ...q, label: "Different question" }]),
  ).toEqual([]);
});
