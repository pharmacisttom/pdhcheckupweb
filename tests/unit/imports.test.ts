import { describe, it, expect } from "vitest";
import { validateImport } from "../../src/server/services/imports";
const row = {
  service_code: "TEST",
  service_name_th: "ทดสอบ",
  service_name_en: "Test",
  category: "lab",
  standard_price: "100.20",
  unit: "item",
  effective_from: "2026-01-01",
  effective_to: "",
  status: "active",
};
describe("price import validation", () => {
  it("accepts deterministic valid rows", () => {
    expect(validateImport([row])).toEqual({ valid: [row], errors: [] });
  });
  it("detects duplicate codes, missing fields, negative prices, invalid dates", () => {
    expect(validateImport([row, row]).errors).toHaveLength(1);
    for (const bad of [
      { ...row, service_code: "" },
      { ...row, standard_price: "-1" },
      { ...row, effective_from: "not-a-date" },
      { ...row, effective_to: "2025-01-01" },
    ])
      expect(validateImport([bad]).errors).toHaveLength(1);
  });
});
