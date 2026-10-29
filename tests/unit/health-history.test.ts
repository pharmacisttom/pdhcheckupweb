import { describe, expect, it } from "vitest";
import { personSchema } from "../../src/lib/domain";
import {
  selectionFromLegacy,
  summarizeHealthSelection,
  validHealthSelection,
} from "../../src/lib/health-history";
const base = {
  firstName: "Synthetic",
  lastName: "Test",
  birthdate: "1990-01-01",
  phone: "0812345678",
};
describe("selectable health histories and legacy compatibility", () => {
  it("preserves an old free-text history exactly instead of guessing diagnoses", () => {
    const text = "เคยผ่าตัด ปี 2550, ข้อมูลอื่นเพิ่มเติม";
    expect(selectionFromLegacy(text)).toEqual({
      status: "specified",
      codes: [],
      custom: [text],
    });
    expect(
      personSchema.parse({ ...base, medicalHistory: text }).medicalHistory,
    ).toBe(text);
  });
  it("recognizes explicit none and unknown without mixing them with choices", () => {
    expect(selectionFromLegacy("None")?.status).toBe("none");
    expect(selectionFromLegacy("ไม่ทราบ")?.status).toBe("unknown");
    expect(
      validHealthSelection("allergies", {
        status: "none",
        codes: ["drug"],
        custom: [],
      }),
    ).toBe(false);
  });
  it("stores stable codes and custom entries with a compatible readable summary", () => {
    const selection = {
      status: "specified" as const,
      codes: ["diabetes", "hypertension"],
      custom: ["เคยรักษาโรคอื่น"],
    };
    const summary = summarizeHealthSelection("medicalHistory", selection);
    const parsed = personSchema.parse({
      ...base,
      medicalHistory: summary,
      healthSelections: { medicalHistory: selection },
    });
    expect(parsed.healthSelections?.medicalHistory).toEqual(selection);
    expect(parsed.medicalHistory).toBe(
      "เบาหวาน; ความดันโลหิตสูง; เคยรักษาโรคอื่น",
    );
  });
  it("rejects unknown codes, duplicates, blank custom rows, oversized totals and mismatched summaries", () => {
    for (const selection of [
      { status: "specified" as const, codes: ["invalid"], custom: [] },
      { status: "specified" as const, codes: ["drug", "drug"], custom: [] },
      { status: "specified" as const, codes: ["drug"], custom: [" "] },
      { status: "specified" as const, codes: [], custom: ["same", " SAME "] },
      { status: "specified" as const, codes: [], custom: ["x".repeat(1001)] },
    ])
      expect(validHealthSelection("allergies", selection)).toBe(false);
    expect(
      personSchema.safeParse({
        ...base,
        allergies: "ไม่มี",
        healthSelections: {
          allergies: { status: "specified", codes: ["drug"], custom: [] },
        },
      }).success,
    ).toBe(false);
  });
  it("localizes preset labels without changing custom text or persisted codes", () => {
    const selection = {
      status: "specified" as const,
      codes: ["supplements"],
      custom: ["My supplement"],
    };
    expect(
      summarizeHealthSelection("currentMedication", selection, (k) =>
        k === "วิตามิน / อาหารเสริม" ? "Vitamins" : k,
      ),
    ).toBe("Vitamins; My supplement");
    expect(selection.codes).toEqual(["supplements"]);
  });
});

it("validates additional registration choices against existing field limits", () => {
  for (const [field, code] of [
    ["surgeryHistory", "previous_surgery"],
    ["assistance", "wheelchair"],
    ["treatmentRightDetails", "pdh_hospital"],
  ] as const) {
    const selection = {
      status: "specified" as const,
      codes: [code],
      custom: ["Synthetic detail"],
    };
    expect(
      personSchema.safeParse({
        ...base,
        [field]: summarizeHealthSelection(field, selection),
        healthSelections: { [field]: selection },
      }).success,
    ).toBe(true);
  }
  expect(
    validHealthSelection("assistance", {
      status: "specified",
      codes: [],
      custom: ["x".repeat(501)],
    }),
  ).toBe(false);
  expect(
    validHealthSelection("familyNcdDetails", {
      status: "specified",
      codes: ["invented"],
      custom: [],
    }),
  ).toBe(false);
  expect(
    personSchema.safeParse({
      ...base,
      assistance: "Legacy assistance",
      treatmentRightDetails: "Legacy hospital",
      surgeryHistory: "Legacy operation",
    }).success,
  ).toBe(true);
});
