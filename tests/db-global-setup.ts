import { PrismaClient } from "@prisma/client";
import { verifyRc02TestDatabase } from "../scripts/test-db-guard.mjs";

export default async function setup() {
  if (process.env.RUN_DB_TESTS !== "true") return;
  const db = new PrismaClient();
  try {
    await verifyRc02TestDatabase(db, process.env.DATABASE_URL ?? "");
  } finally {
    await db.$disconnect();
  }
}
