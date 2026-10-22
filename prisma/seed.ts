import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { Question, RiskRule } from "../src/lib/domain";
const db = new PrismaClient();
async function main() {
  if (process.env.NODE_ENV === "production" || process.env.SEED_DEMO !== "true")
    throw new Error(
      "Seed requires SEED_DEMO=true and a non-production environment",
    );
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 14)
    throw new Error(
      "Set SEED_ADMIN_EMAIL and a unique password of at least 14 characters",
    );
  const admin = await db.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash: await bcrypt.hash(password, 12),
      name: "ผู้ดูแลระบบสาธิต",
      role: "superadmin",
    },
    update: {},
  });
  const services = [];
  for (const [code, nameTh, nameEn, amount] of [
    ["DEMO-CBC", "[สาธิต] ความสมบูรณ์ของเม็ดเลือด", "Demo CBC", "120.00"],
    ["DEMO-GLU", "[สาธิต] น้ำตาลในเลือด", "Demo glucose", "60.00"],
    ["DEMO-UA", "[สาธิต] ตรวจปัสสาวะ", "Demo urinalysis", "80.00"],
    ["DEMO-LIPID", "[สาธิต] ไขมันในเลือด", "Demo lipid panel", "300.00"],
  ]) {
    const s = await db.service.upsert({
      where: { code },
      create: {
        code,
        nameTh,
        nameEn,
        category: "laboratory",
        componentCodes: [],
      },
      update: {},
    });
    await db.price.upsert({
      where: { serviceId_version: { serviceId: s.id, version: 1 } },
      create: {
        serviceId: s.id,
        amount,
        version: 1,
        effectiveFrom: new Date("2020-01-01T00:00:00Z"),
        approvedBy: admin.id,
      },
      update: {},
    });
    services.push(s);
  }
  const questions: Question[] = [
    ...[
      ["diabetes", "เบาหวาน"],
      ["hypertension", "ความดันโลหิตสูง"],
      ["dyslipidemia", "ไขมันในเลือดสูง"],
      ["kidney", "โรคไตเรื้อรัง"],
      ["heart", "โรคหัวใจและหลอดเลือด"],
      ["liver", "โรคตับ"],
    ].map(([id, name]): Question => ({
      id,
      label: "เคยได้รับการวินิจฉัย" + name + "หรือไม่",
      type: "single",
      options: ["ไม่เคย", "เคย", "ไม่ทราบ"],
      required: true,
    })),
    {
      id: "family",
      label: "ประวัติโรคไม่ติดต่อในญาติสายตรง",
      type: "multiple",
      options: ["เบาหวาน", "ความดันโลหิตสูง", "โรคหัวใจ", "ไม่มี", "ไม่ทราบ"],
    },
    {
      id: "smoking",
      label: "การสูบบุหรี่",
      type: "single",
      options: ["ไม่สูบ", "เคยสูบ", "ยังสูบ", "ไม่ประสงค์ตอบ"],
      required: true,
    },
    {
      id: "alcohol",
      label: "การดื่มแอลกอฮอล์",
      type: "single",
      options: ["ไม่ดื่ม", "บางครั้ง", "เป็นประจำ", "ไม่ประสงค์ตอบ"],
      required: true,
    },
    { id: "weight", label: "น้ำหนัก (กก.)", type: "numeric", min: 1, max: 400 },
    {
      id: "height",
      label: "ส่วนสูง (ซม.)",
      type: "numeric",
      min: 30,
      max: 250,
    },
    {
      id: "medication",
      label: "มียาที่ใช้ประจำหรือไม่",
      type: "single",
      options: ["ไม่มี", "มี", "ไม่ทราบ"],
    },
    {
      id: "medication_details",
      label: "ยาที่ใช้ประจำ",
      type: "text",
      required: true,
      showIf: { field: "medication", equals: "มี" },
    },
    { id: "allergy", label: "ประวัติแพ้ยา (ถ้ามี)", type: "text" },
    {
      id: "other",
      label: "โรคประจำตัวหรือข้อมูลอื่นที่ต้องการแจ้ง",
      type: "text",
    },
    { id: "exposure", label: "ความเสี่ยงจากการทำงาน", type: "text" },
    {
      id: "pregnancy",
      label: "ตั้งครรภ์หรืออาจตั้งครรภ์ (กรณีเกี่ยวข้อง)",
      type: "single",
      options: ["ไม่เกี่ยวข้อง", "ไม่ใช่", "ใช่", "ไม่ทราบ"],
    },
    {
      id: "symptoms",
      label:
        "[ตัวอย่างทดสอบ] มีอาการที่ต้องการให้เจ้าหน้าที่ประเมินก่อนจองหรือไม่",
      type: "single",
      options: ["ไม่มี", "มี"],
      required: true,
    },
  ];
  const rules: RiskRule[] = [
    {
      id: "demo-review",
      field: "symptoms",
      equals: "มี",
      decision: "needs_clinical_review",
      reason: "[กฎสาธิต] ต้องประเมินโดยบุคลากรก่อนนัดหมาย",
    },
    {
      id: "demo-pregnancy",
      field: "pregnancy",
      equals: "ใช่",
      decision: "needs_clinical_review",
      reason: "[กฎสาธิต] ต้องประเมินความเหมาะสมของรายการตรวจ",
    },
  ];
  await db.questionnaire.upsert({
    where: { version: 1 },
    create: {
      version: 1,
      questions,
      rules,
      status: "published",
      approvedBy: admin.id,
    },
    update: {},
  });
  for (const [key, name, price, count] of [
    ["DEMO-BASIC", "[สาธิต] สุขภาพพื้นฐาน", "260.00", 3],
    ["DEMO-PLUS", "[สาธิต] สุขภาพพลัส", "500.00", 4],
  ] as const) {
    await db.package.upsert({
      where: { key_version: { key, version: 1 } },
      create: {
        key,
        version: 1,
        name,
        description:
          "ข้อมูลสังเคราะห์สำหรับทดสอบระบบ ไม่ใช่แพ็กเกจหรือราคาจริงของโรงพยาบาล",
        audience: "ผู้ทดสอบระบบ",
        fixedPrice: price,
        preparation:
          "คำแนะนำตัวอย่าง ต้องให้โรงพยาบาลกำหนดและอนุมัติคำแนะนำจริงก่อนใช้งาน",
        status: "published",
        approvedBy: admin.id,
        effectiveFrom: new Date("2020-01-01T00:00:00Z"),
        items: {
          create: services
            .slice(0, count)
            .map((s, position) => ({ serviceId: s.id, position })),
        },
      },
      update: {},
    });
  }
  for (let i = 2; i <= 15; i++) {
    const date = new Date(Date.now() + i * 86400000);
    const dayId = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
    }).format(date);
    await db.dayCapacity.upsert({
      where: { id: dayId },
      create: { id: dayId, capacity: 10 },
      update: {},
    });
    for (const hour of ["08", "09"]) {
      const startsAt = new Date(dayId + "T" + hour + ":00:00+07:00");
      await db.slot.upsert({
        where: { startsAt },
        create: {
          dayId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 3600000),
          capacity: 5,
        },
        update: {},
      });
    }
  }
  console.log(
    "Synthetic development catalog, questionnaire, slots and operator created. No patient data seeded.",
  );
}
main().finally(() => db.$disconnect());
