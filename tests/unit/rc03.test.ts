import { describe, expect, it } from "vitest";
import { ageOn, validThaiId } from "../../src/lib/patient-validation";
import {
  personSchema,
  evaluateRules,
  validateAnswers,
  type Question,
} from "../../src/lib/domain";
import {
  proposeRc03Questionnaire,
  questionnaireInventory,
} from "../../src/lib/rc03-questionnaire";

const person = {
  firstName: "Synthetic",
  lastName: "RC03",
  birthdate: "1991-11-24",
  phone: "0812345678",
};
describe("RC03 Bangkok birthdays and document policy", () => {
  it.each([
    ["2026-11-23T16:59:59.999Z", 34],
    ["2026-11-23T17:00:00.000Z", 35],
    ["2027-11-23T17:00:00.000Z", 36],
  ])("uses the Bangkok calendar at %s", (at, age) => {
    expect(ageOn(person.birthdate, new Date(at))).toBe(age);
  });
  it("accepts a newborn at Bangkok midnight before UTC midnight", () => {
    expect(ageOn("2026-11-24", new Date("2026-11-23T17:00:00Z"))).toBe(0);
    expect(() =>
      ageOn("2026-11-25", new Date("2026-11-23T17:00:00Z")),
    ).toThrow();
    expect(() => ageOn("2026-02-30")).toThrow();
    expect(() => ageOn(person.birthdate, new Date("invalid"))).toThrow();
  });
  it.each([
    "110170020345",
    "1101700203459",
    "11017002034500",
    "1101700203450x",
    "0000000000000",
  ])("rejects malformed ID %s", (id) => {
    expect(validThaiId(id)).toBe(false);
    expect(
      personSchema.safeParse({
        ...person,
        documentType: "thai_id",
        identifier: id,
      }).success,
    ).toBe(false);
  });
  it("accepts a valid checksum and retains alternative-document policy", () => {
    const prefix = "110170020345";
    const sum = [...prefix].reduce((n, d, i) => n + Number(d) * (13 - i), 0);
    const identifier = prefix + ((11 - (sum % 11)) % 10);
    expect(validThaiId(identifier)).toBe(true);
    expect(
      personSchema.safeParse({ ...person, documentType: "thai_id", identifier })
        .success,
    ).toBe(true);
    expect(personSchema.safeParse(person).success).toBe(true);
    expect(
      personSchema.safeParse({
        ...person,
        documentType: "passport",
        identifier: "SYNTHETIC",
      }).success,
    ).toBe(true);
  });
});
describe("new intake versus historical payloads", () => {
  const current = {
    ...person,
    intakeVersion: 3,
    heightCm: 170,
    weightKg: 70,
    sex: "unspecified",
    treatmentRight: "unknown",
    medicalHistory: "None",
    surgeryHistory: "None",
    currentMedication: "None",
    allergies: "None",
    familyNcdStatus: "unknown",
  };
  it("requires both measurements for current intake but reads old records", () => {
    expect(personSchema.safeParse(current).success).toBe(true);
    expect(
      personSchema.safeParse({
        ...current,
        heightCm: undefined,
        weightKg: undefined,
      }).success,
    ).toBe(false);
    expect(personSchema.safeParse(person).success).toBe(true);
  });
  it("requires group contact metadata and preserves the individual default", () => {
    expect(personSchema.parse(person).registrationMode).toBe("individual");
    expect(
      personSchema.safeParse({ ...current, registrationMode: "group" }).success,
    ).toBe(false);
    expect(
      personSchema.safeParse({
        ...current,
        registrationMode: "group",
        group: {
          organizationId: "synthetic",
          primaryContact: "Coordinator",
          contactPhone: "0812345678",
        },
      }).success,
    ).toBe(true);
  });
});
describe("clinician proposal compatibility", () => {
  const questions: Question[] = [
    {
      id: "old",
      label: "Existing question",
      type: "single",
      options: ["yes", "no"],
      required: true,
    },
    {
      id: "conditional",
      label: "Existing question",
      type: "text",
      showIf: { field: "old", equals: "yes" },
    },
  ];
  it("retains historical IDs, conditions and rules, adds no diagnostic rule", () => {
    const snapshot = structuredClone(questions);
    const proposal = proposeRc03Questionnaire(questions, []);
    expect(questions).toEqual(snapshot);
    expect(proposal.questions.slice(0, 2)).toEqual(snapshot);
    expect(
      questionnaireInventory(questions, []).duplicateLabelCandidates,
    ).toEqual([["old", "conditional"]]);
    expect(validateAnswers(questions, { old: "no" })).toEqual([]);
    for (const snoring_history of ["yes", "no", "unknown"]) {
      const answers = { old: "no", snoring_history };
      expect(validateAnswers(proposal.questions, answers)).toEqual([]);
      expect(evaluateRules(proposal.rules, answers, 2)).toEqual([]);
    }
    expect(validateAnswers(proposal.questions, { old: "no" })).toEqual([]);
    expect(() => proposeRc03Questionnaire(proposal.questions, [])).toThrow();
  });
});
