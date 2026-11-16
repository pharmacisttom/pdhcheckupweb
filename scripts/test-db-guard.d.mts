import type { PrismaClient } from "@prisma/client";

export const RC02_TEST_DATABASE: "pdh_healthcheck_rc01_test";
export const RC02_TEST_USER: "pdh_test";
export const RC02_MIGRATION_COUNT: 14;

export function parseRc02TestDatabaseUrl(rawUrl: string): URL;
export function assertTestGrants(rows: Record<string, unknown>[]): void;
export function assertTestIdentity(
  row: { current_user?: string; database_name?: string },
  hostname: string,
): void;
export function assertMigrationState(
  row: { total_migrations?: number; completed_migrations?: number; incomplete_migrations?: number },
): void;
export function verifyRc02TestDatabase(
  prisma: PrismaClient,
  rawUrl: string,
): Promise<{ database: string; migrations: number }>;
