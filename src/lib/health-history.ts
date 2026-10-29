export const healthHistoryFields = [
  "medicalHistory",
  "currentMedication",
  "allergies",
  "surgeryHistory",
  "assistance",
  "treatmentRightDetails",
  "familyNcdDetails",
] as const;
export type HealthHistoryField = (typeof healthHistoryFields)[number];
export type HealthSelection = {
  status: "none" | "unknown" | "specified";
  codes: string[];
  custom: string[];
};
export type HealthSelections = Partial<
  Record<HealthHistoryField, HealthSelection>
>;
export const healthHistoryOptions: Record<
  HealthHistoryField,
  { code: string; label: string }[]
> = {
  medicalHistory: [
    { code: "diabetes", label: "เบาหวาน" },
    { code: "hypertension", label: "ความดันโลหิตสูง" },
    { code: "dyslipidemia", label: "ไขมันในเลือดสูง" },
    { code: "heart_disease", label: "โรคหัวใจ" },
    { code: "kidney_disease", label: "โรคไตเรื้อรัง" },
    { code: "asthma", label: "หอบหืด" },
    { code: "past_surgery", label: "เคยได้รับการผ่าตัด" },
  ],
  currentMedication: [
    { code: "regular_medicine", label: "ยาประจำ" },
    { code: "occasional_medicine", label: "ยาที่ใช้เป็นครั้งคราว" },
    { code: "supplements", label: "วิตามิน / อาหารเสริม" },
    { code: "herbal", label: "สมุนไพร" },
  ],
  surgeryHistory: [{ code: "previous_surgery", label: "เคยได้รับการผ่าตัด" }],
  assistance: [
    { code: "wheelchair", label: "ต้องการรถเข็น" },
    { code: "walking_support", label: "ต้องการความช่วยเหลือในการเดิน" },
    { code: "interpreter", label: "ต้องการล่ามภาษา" },
    { code: "hearing_support", label: "ต้องการความช่วยเหลือด้านการได้ยิน" },
    { code: "vision_support", label: "ต้องการความช่วยเหลือด้านการมองเห็น" },
  ],
  treatmentRightDetails: [{ code: "pdh_hospital", label: "โรงพยาบาลปลวกแดง" }],
  familyNcdDetails: [],
  allergies: [
    { code: "drug", label: "แพ้ยา" },
    { code: "food", label: "แพ้อาหาร" },
    { code: "other_substance", label: "แพ้สารอื่น ๆ" },
  ],
};
export const healthHistoryLimits: Record<HealthHistoryField, number> = {
  medicalHistory: 2000,
  currentMedication: 2000,
  allergies: 1000,
  surgeryHistory: 2000,
  assistance: 500,
  treatmentRightDetails: 500,
  familyNcdDetails: 2000,
};
export function selectionFromLegacy(
  value: string,
): HealthSelection | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (
    ["ไม่มี", "none", "no", "无", "မရှိ", "គ្មាន"].includes(text.toLowerCase())
  )
    return { status: "none", codes: [], custom: [] };
  if (
    ["ไม่ทราบ", "unknown", "不清楚", "မသိပါ", "មិនដឹង"].includes(
      text.toLowerCase(),
    )
  )
    return { status: "unknown", codes: [], custom: [] };
  return { status: "specified", codes: [], custom: [value] };
}
export function summarizeChoices(
  s: HealthSelection,
  options: { code: string; label: string }[],
  t: (key: string) => string = (key) => key,
) {
  if (s.status === "none") return t("ไม่มี");
  if (s.status === "unknown") return t("ไม่ทราบ");
  return [
    ...s.codes.map((code) =>
      t(options.find((o) => o.code === code)?.label ?? code),
    ),
    ...s.custom.map((v) => v.trim()).filter(Boolean),
  ].join("; ");
}
export function summarizeHealthSelection(
  field: HealthHistoryField,
  s: HealthSelection,
  t: (key: string) => string = (key) => key,
) {
  return summarizeChoices(s, healthHistoryOptions[field], t);
}
export function validChoices(
  s: HealthSelection,
  options: { code: string; label: string }[],
  maxLength: number,
) {
  if (s.status === "none" || s.status === "unknown")
    return s.codes.length === 0 && s.custom.length === 0;
  if (
    s.status !== "specified" ||
    s.codes.length + s.custom.length === 0 ||
    s.codes.length > 20 ||
    s.custom.length > 20
  )
    return false;
  if (
    s.codes.some((code) => !options.some((o) => o.code === code)) ||
    new Set(s.codes).size !== s.codes.length
  )
    return false;
  const custom = s.custom.map((v) => v.trim().toLowerCase());
  return (
    !custom.some((v) => !v) &&
    new Set(custom).size === custom.length &&
    summarizeChoices(s, options).length <= maxLength
  );
}
export function validHealthSelection(
  field: HealthHistoryField,
  s: HealthSelection,
) {
  return validChoices(
    s,
    healthHistoryOptions[field],
    healthHistoryLimits[field],
  );
}
