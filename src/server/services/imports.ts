import ExcelJS from "exceljs";
import { createHash } from 'node:crypto';
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, audit } from "@/lib/security";
import { assertSafeXlsx, assertCsvRowLimit } from './import-limits';
const rowSchema = z
  .object({
    service_code: z.string().min(1).max(80),
    service_name_th: z.string().min(1).max(255),
    service_name_en: z.string().max(255),
    category: z.string().min(1).max(80),
    standard_price: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/),
    unit: z.string().min(1).max(40),
    effective_from: z.iso.date(),
    effective_to: z.union([z.iso.date(), z.literal("")]),
    status: z.enum(["active", "inactive"]),
  })
  .refine(
    (r) => !r.effective_to || r.effective_to > r.effective_from,
    "effective_to ต้องมากกว่า effective_from",
  );
export type ImportRow = z.infer<typeof rowSchema>;
export const importFields = [
  "service_code",
  "service_name_th",
  "service_name_en",
  "category",
  "standard_price",
  "unit",
  "effective_from",
  "effective_to",
  "status",
];
export function validateImport(rows: Record<string, string>[]) {
  const seen = new Set<string>();
  const valid: ImportRow[] = [];
  const errors: { row: number; message: string }[] = [];
  rows.forEach((row, i) => {
    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) {
      errors.push({
        row: i + 2,
        message: parsed.error.issues
          .map((e) => e.path.join(".") + ": " + e.message)
          .join("; "),
      });
      return;
    }
    if (seen.has(parsed.data.service_code))
      errors.push({
        row: i + 2,
        message: "service_code ซ้ำ: " + parsed.data.service_code,
      });
    seen.add(parsed.data.service_code);
    valid.push(parsed.data);
  });
  return { valid, errors };
}
export async function stageImport(
  file: File,
  operatorId: string,
  mapping: Record<string, string>,
) {
  if (file.size > 2 * 1024 * 1024)
    throw new AppError(413, "ไฟล์ต้องมีขนาดไม่เกิน 2 MB");
  const data = Buffer.from(await file.arrayBuffer());
  const book = new ExcelJS.Workbook();
  if (/\.csv$/i.test(file.name)) {
    assertCsvRowLimit(data);
    const { Readable } = await import("node:stream");
    await book.csv.read(Readable.from([data]));
  } else if (/\.xlsx$/i.test(file.name)) {
    assertSafeXlsx(data);
    await book.xlsx.load(
      data as unknown as Parameters<typeof book.xlsx.load>[0],
    );
  } else throw new AppError(422, "รองรับเฉพาะ CSV และ XLSX");
  const sheet = book.worksheets[0];
  if (!sheet || sheet.rowCount > 5001)
    throw new AppError(422, "จำกัดไม่เกิน 5,000 แถวต่อไฟล์");
  const headers = (sheet.getRow(1).values as ExcelJS.CellValue[])
    .slice(1)
    .map((v) =>
      String(v ?? "")
        .trim()
        .replace(/^\uFEFF/, ""),
    );
  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, n) => {
    if (n === 1 || !row.hasValues) return;
    const record: Record<string, string> = {};
    for (const field of importFields) {
      const col = headers.indexOf(mapping[field] || field);
      const value = col < 0 ? "" : row.getCell(col + 1).value;
      if (value && typeof value === "object" && !(value instanceof Date))
        throw new AppError(422, `แถว ${n}: ไม่รับสูตร ลิงก์ หรือ rich text`);
      record[field] =
        value instanceof Date
          ? value.toISOString().slice(0, 10)
          : String(value ?? "").trim();
      if (/^[=+@]/.test(record[field]))
        throw new AppError(422, `แถว ${n}: ไม่รับสูตร`);
    }
    if (Object.values(record).some(Boolean)) rows.push(record);
  });
  if (!rows.length) throw new AppError(422, "ไฟล์ไม่มีข้อมูล");
  const { valid, errors } = validateImport(rows);
  return db.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: {
        fileHash: createHash('sha256').update(data).digest('hex'),
        operatorId,
        rows: valid,
        errors,
        status: errors.length ? "invalid" : "staged",
      },
    });
    await audit(tx, operatorId, "import.staged", batch.id, {
      rows: rows.length,
      errors: errors.length,
    });
    return batch;
  });
}
export async function approveImport(id: string, approverId: string) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM ImportBatch WHERE id = ${id} FOR UPDATE`;
      const batch = await tx.importBatch.findUniqueOrThrow({ where: { id } });
      if (batch.status !== "staged" || batch.operatorId === approverId)
        throw new AppError(
          409,
          "ต้องใช้ผู้อนุมัติคนละคน และข้อมูลต้องผ่านการตรวจสอบ",
        );
      for (const row of batch.rows as ImportRow[]) {
        const existing = await tx.service.findUnique({
          where: { code: row.service_code },
        });
        if (
          existing &&
          (existing.nameTh !== row.service_name_th ||
            existing.category !== row.category)
        )
          throw new AppError(
            409,
            "ชื่อหรือหมวดบริการไม่ตรงกับรหัสเดิม ต้องตรวจสอบการจับคู่: " +
              row.service_code,
          );
        const service = await tx.service.upsert({
          where: { code: row.service_code },
          create: {
            code: row.service_code,
            nameTh: row.service_name_th,
            nameEn: row.service_name_en,
            category: row.category,
            unit: row.unit,
            componentCodes: [],
            active: row.status === "active",
          },
          update: { active: row.status === "active" },
        });
        await tx.$queryRaw`SELECT id FROM Service WHERE id = ${service.id} FOR UPDATE`;
        const latest = await tx.price.findFirst({
          where: { serviceId: service.id },
          orderBy: { version: "desc" },
        });
        await tx.price.create({
          data: {
            serviceId: service.id,
            amount: row.standard_price,
            version: (latest?.version ?? 0) + 1,
            effectiveFrom: new Date(row.effective_from + "T00:00:00+07:00"),
            effectiveTo: row.effective_to
              ? new Date(row.effective_to + "T00:00:00+07:00")
              : null,
            approvedBy: approverId,
            importId: id,
          },
        });
      }
      await tx.importBatch.update({
        where: { id },
        data: { status: "published", approvedBy: approverId },
      });
      await audit(tx, approverId, "import.published", id);
      return { id, status: "published" };
    },
    { isolationLevel: "ReadCommitted", timeout: 30000 },
  );
}
