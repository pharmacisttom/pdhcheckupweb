import { db } from "@/lib/db";
import { calculateQuote, fingerprint, type PricedService } from "@/lib/domain";
import { AppError } from "@/lib/security";
import type { Prisma } from "@prisma/client";
type DB = Prisma.TransactionClient;
export async function currentPackage(id: string, tx: DB = db) {
  const now = new Date();
  const pkg = await tx.package.findFirst({
    where: {
      id,
      status: "published",
      approvedBy: { not: null },
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    include: {
      items: { include: { service: true }, orderBy: { position: "asc" } },
    },
  });
  if (!pkg) throw new AppError(422, "แพ็กเกจนี้ยังไม่เปิดให้บริการ");
  if (pkg.items.some((i) => !i.service.active))
    throw new AppError(422, "แพ็กเกจมีบริการที่ปิดใช้งาน");
  return pkg;
}
export async function quoteSnapshot(
  packageId: string,
  addonIds: string[],
  tx: DB = db,
) {
  const pkg = await currentPackage(packageId, tx);
  const now = new Date();
  if (new Set(addonIds).size !== addonIds.length)
    throw new AppError(422, "มีรายการตรวจซ้ำ");
  const services = await tx.service.findMany({
    where: { id: { in: addonIds }, active: true },
    include: {
      prices: {
        where: {
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
        take: 1,
      },
    },
  });
  if (
    services.length !== addonIds.length ||
    services.some((s) => !s.prices.length)
  )
    throw new AppError(422, "บริการบางรายการไม่มีราคาที่อนุมัติ");
  if (
    services.some((s) => s.requiresReview) ||
    pkg.items.some((i) => i.service.requiresReview)
  )
    throw new AppError(
      422,
      "บริการนี้ต้องผ่านการประเมินโดยแพทย์ก่อนจอง",
      "CLINICAL_REVIEW",
    );
  const convert = (s: (typeof services)[number]): PricedService => ({
    id: s.id,
    code: s.code,
    name: s.nameTh,
    amount: s.prices[0].amount.toFixed(2),
    version: s.prices[0].version,
    components: s.componentCodes as string[],
  });
  try {
    return calculateQuote(
      {
        id: pkg.id,
        name: pkg.name,
        version: pkg.version,
        price: pkg.fixedPrice.toFixed(2),
        items: pkg.items
          .filter((i) => i.mode === "included")
          .map((i) => ({
            id: i.service.id,
            code: i.service.code,
            name: i.service.nameTh,
            amount: "0",
            version: 0,
            components: i.service.componentCodes as string[],
          })),
      },
      services.sort((a, b) => a.code.localeCompare(b.code)).map(convert),
    );
  } catch (e) {
    throw new AppError(
      422,
      e instanceof Error ? e.message : "คำนวณราคาไม่สำเร็จ",
    );
  }
}
export async function createQuote(
  sessionId: string,
  packageId: string,
  addonIds: string[],
) {
  const snapshot = await quoteSnapshot(packageId, addonIds);
  const q = await db.quote.create({
    data: {
      sessionId,
      packageId,
      snapshot,
      fingerprint: fingerprint(snapshot),
      total: snapshot.total,
      expiresAt: new Date(Date.now() + 15 * 60000),
    },
  });
  return {
    id: q.id,
    fingerprint: q.fingerprint,
    expiresAt: q.expiresAt,
    ...snapshot,
  };
}
