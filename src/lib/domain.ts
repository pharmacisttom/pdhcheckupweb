import { z } from "zod";
import Decimal from "decimal.js";
import { createHash } from "node:crypto";

export function normalizePhone(input: string) {
  const digits = input.replace(/[\s()-]/g, "").replace(/^\+66/, "0");
  if (!/^0[689]\d{8}$/.test(digits))
    throw new Error("กรุณาระบุเบอร์มือถือไทยที่ถูกต้อง");
  return "+66" + digits.slice(1);
}
export function validThaiId(value: string) {
  if (!/^\d{13}$/.test(value) || /^(\d)\1{12}$/.test(value)) return false;
  const sum = [...value.slice(0, 12)].reduce(
    (n, digit, i) => n + Number(digit) * (13 - i),
    0,
  );
  return (11 - (sum % 11)) % 10 === Number(value[12]);
}
export function toGregorian(year: number) {
  return year >= 2400 ? year - 543 : year;
}
export function toBuddhist(year: number) {
  return year + 543;
}
export function ageOn(birthdate: string, at = new Date()) {
  const birth = new Date(birthdate + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(birthdate) ||
    !Number.isFinite(birth.getTime()) ||
    birth.toISOString().slice(0, 10) !== birthdate ||
    birth > at
  )
    throw new Error("วันเกิดไม่ถูกต้อง");
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  if (
    at.getUTCMonth() < birth.getUTCMonth() ||
    (at.getUTCMonth() === birth.getUTCMonth() &&
      at.getUTCDate() < birth.getUTCDate())
  )
    age--;
  if (age > 130) throw new Error("กรุณาตรวจสอบปีเกิด");
  return age;
}
export const personSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    birthdate: z.string().refine((v) => {
      try {
        ageOn(v);
        return true;
      } catch {
        return false;
      }
    }, "วันเกิดไม่ถูกต้อง"),
    intakeVersion: z.literal(2).optional(),
    locale: z.enum(["th", "en", "zh-Hans", "my", "km"]).default("th"),
    surgeryHistory: z.string().trim().max(2000).optional(),
    familyNcdEntries: z
      .array(
        z.object({
          relationship: z.enum(["mother", "father", "sibling", "child"]),
          disease: z.enum([
            "diabetes",
            "hypertension",
            "heart_disease",
            "stroke",
            "cancer",
            "other",
          ]),
          note: z.string().trim().max(500).optional(),
        }),
      )
      .max(30)
      .optional(),
    sex: z.enum(["male", "female", "other", "unspecified"]).optional(),
    treatmentRight: z
      .enum([
        "universal",
        "social_security",
        "civil_servant",
        "private_insurance",
        "self_pay",
        "other",
        "unknown",
      ])
      .optional(),
    treatmentRightDetails: z.string().trim().max(500).optional(),
    medicalHistory: z.string().trim().max(2000).optional(),
    currentMedication: z.string().trim().max(2000).optional(),
    allergies: z.string().trim().max(1000).optional(),
    familyNcdStatus: z.enum(["yes", "no", "unknown"]).optional(),
    familyNcdDetails: z.string().trim().max(2000).optional(),
    phone: z.string().transform((value, ctx) => {
      try {
        return normalizePhone(value);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "กรุณาระบุเบอร์มือถือไทยที่ถูกต้อง",
        });
        return z.NEVER;
      }
    }),
    email: z.union([z.email(), z.literal("")]).optional(),
    documentType: z.enum(["none", "thai_id", "passport"]).default("none"),
    identifier: z.string().max(50).optional(),
    assistance: z.string().max(500).optional(),
    contactChannel: z.enum(["sms", "email"]).default("sms"),
  })
  .superRefine((p, ctx) => {
    if (p.intakeVersion === 2) {
      for (const field of [
        "sex",
        "treatmentRight",
        "medicalHistory",
        "surgeryHistory",
        "currentMedication",
        "allergies",
        "familyNcdStatus",
      ] as const) {
        if (!p[field]?.trim())
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: "กรุณาระบุข้อมูล หรือระบุ ไม่มี / ไม่ทราบ",
          });
      }
      if (p.familyNcdStatus === "yes" && !p.familyNcdEntries?.length)
        ctx.addIssue({
          code: "custom",
          path: ["familyNcdEntries"],
          message: "กรุณาระบุความสัมพันธ์และโรคโดยไม่ระบุชื่อญาติ",
        });
    }
    if (
      p.familyNcdStatus === "yes" &&
      !p.familyNcdDetails?.trim() &&
      !p.familyNcdEntries?.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["familyNcdDetails"],
        message: "กรุณาระบุญาติและโรค NCD",
      });
    if (p.documentType === "thai_id" && !validThaiId(p.identifier ?? ""))
      ctx.addIssue({
        code: "custom",
        path: ["identifier"],
        message: "เลขประจำตัวประชาชนไม่ถูกต้อง",
      });
    if (p.documentType === "passport" && !p.identifier?.trim())
      ctx.addIssue({
        code: "custom",
        path: ["identifier"],
        message: "กรุณาระบุเลขหนังสือเดินทาง",
      });
  });
export type Person = z.infer<typeof personSchema>;
export const assessmentSchema = z.record(
  z.string().max(80),
  z.union([
    z.string().max(1000),
    z.number().finite(),
    z.boolean(),
    z.array(z.string().max(100)).max(30),
  ]),
);
export type Question = {
  translations?: Partial<
    Record<
      "th" | "en" | "zh-Hans" | "my" | "km",
      { label: string; options?: Record<string, string> }
    >
  >;
  id: string;
  label: string;
  type: "single" | "multiple" | "numeric" | "text";
  options?: string[];
  required?: boolean;
  min?: number;
  max?: number;
  showIf?: { field: string; equals: string | boolean };
};
export type RiskRule = {
  translations?: Partial<Record<"th" | "en" | "zh-Hans" | "my" | "km", string>>;
  id: string;
  field: string;
  equals: string | boolean;
  decision:
    | "eligible"
    | "needs_clinical_review"
    | "not_eligible_for_specific_service"
    | "suggested_package"
    | "suggested_add_on"
    | "safety_warning";
  reason: string;
  serviceCode?: string;
};
export function visibleQuestion(q: Question, answers: Record<string, unknown>) {
  return !q.showIf || answers[q.showIf.field] === q.showIf.equals;
}
export function validateAnswers(
  questions: Question[],
  answers: Record<string, unknown>,
) {
  const errors: string[] = [];
  for (const q of questions) {
    if (!visibleQuestion(q, answers)) continue;
    const v = answers[q.id];
    if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) {
      if (q.required) errors.push(q.label + ": กรุณาตอบคำถาม");
      continue;
    }
    if (
      q.type === "numeric" &&
      (typeof v !== "number" ||
        !Number.isFinite(v) ||
        (q.min !== undefined && v < q.min) ||
        (q.max !== undefined && v > q.max))
    )
      errors.push(q.label + ": ค่าต้องอยู่ในช่วงที่กำหนด");
    if (
      q.type === "single" &&
      (typeof v !== "string" || !q.options?.includes(v))
    )
      errors.push(q.label + ": ตัวเลือกไม่ถูกต้อง");
    if (
      q.type === "multiple" &&
      (!Array.isArray(v) ||
        v.some((x) => typeof x !== "string" || !q.options?.includes(x)))
    )
      errors.push(q.label + ": ตัวเลือกไม่ถูกต้อง");
    if (q.type === "text" && typeof v !== "string")
      errors.push(q.label + ": ต้องเป็นข้อความ");
  }
  return errors;
}
export function evaluateRules(
  rules: RiskRule[],
  answers: Record<string, unknown>,
  version: number,
) {
  return rules
    .filter((r) =>
      Array.isArray(answers[r.field])
        ? (answers[r.field] as unknown[]).includes(r.equals)
        : answers[r.field] === r.equals,
    )
    .map((r) => ({
      ruleId: r.id,
      version,
      decision: r.decision,
      reason: r.reason,
      translations: r.translations,
      serviceCode: r.serviceCode,
    }));
}
export type PricedService = {
  id: string;
  code: string;
  name: string;
  amount: string;
  version: number;
  components: string[];
  requiresReview?: boolean;
};
export function calculateQuote(
  pkg: {
    id: string;
    name: string;
    version: number;
    price: string;
    items: PricedService[];
  },
  addons: PricedService[],
) {
  const seen = new Set(pkg.items.flatMap((s) => [s.code, ...s.components]));
  const lines = [
    {
      id: pkg.id,
      code: "PACKAGE",
      name: pkg.name,
      amount: new Decimal(pkg.price).toFixed(2),
      version: pkg.version,
    },
  ];
  for (const service of addons) {
    const codes = [service.code, ...service.components];
    if (codes.some((c) => seen.has(c)))
      throw new Error("รายการซ้ำหรือทับซ้อนกับชุดตรวจ: " + service.code);
    codes.forEach((c) => seen.add(c));
    const amount = new Decimal(service.amount);
    if (amount.isNegative()) throw new Error("ราคาไม่ถูกต้อง");
    lines.push({
      id: service.id,
      code: service.code,
      name: service.name,
      amount: amount.toFixed(2),
      version: service.version,
    });
  }
  const total = lines
    .reduce((sum, l) => sum.plus(l.amount), new Decimal(0))
    .toFixed(2);
  return {
    ruleVersion: "fixed-package-plus-addons-v1",
    currency: "THB",
    packageId: pkg.id,
    lines,
    total,
  };
}
export function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export const transitions: Record<string, string[]> = {
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["in_service", "cancelled"],
  in_service: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
};
export function canTransition(from: string, to: string) {
  return transitions[from]?.includes(to) ?? false;
}
export const activeStatuses = [
  "confirmed",
  "checked_in",
  "in_service",
  "completed",
  "no_show",
];
export const bangkokDate = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const thaiDate = (date: Date | string) =>
  new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
export function csvSafe(value: unknown) {
  const s = String(value ?? "");
  return (
    '"' + (/^[\s]*[=+@\-\t\r]/.test(s) ? "'" : "") + s.replace(/"/g, '""') + '"'
  );
}
