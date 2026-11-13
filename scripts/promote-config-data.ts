/**
 * PDH Smart Health Check — Staging to Production Configuration Data Promotion Tool
 *
 * MANDATORY SAFETY CONTROLS:
 * 1. Selective promotion ONLY: Master config data (Questionnaires, Services, Packages, PackageItems, DayCapacities, Slots).
 * 2. STRICTLY EXCLUDES: BookingPolicy, Patients, Registrations, Bookings, Holds, Quotes, Invoices,
 *    Users, Sessions, MFA secrets, Passwords, Recovery codes, Audit logs (except 1 promotion audit entry).
 * 3. Exact database names enforced: Source = pdh_healthcheck_staging, Target = pdh_healthcheck.
 * 4. Never overwrites Production with a full database dump.
 * 5. Prices are NOT published without explicit opt-in flag `--promote-approved-prices`.
 * 6. Preserves existing Slot reservations in Production; never resets reservedCapacity below active bookings/holds.
 * 7. Supports `--dry-run` and `--apply` (with manifest checksum verification).
 * 8. Never logs cleartext database passwords.
 * 9. Fail-closed: Unresolved relationships reject the entire operation before writing.
 * 10. Transactional: All changes run inside a single ACID transaction in `--apply`.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { manifestHash, verifyApprovedManifest } from './promotion-manifest';

async function configurationFingerprint(client: Prisma.TransactionClient): Promise<string> {
  const tables = [
    await client.questionnaire.findMany(), await client.service.findMany(),
    await client.price.findMany(), await client.package.findMany(),
    await client.packageItem.findMany(), await client.dayCapacity.findMany(),
    await client.slot.findMany(),
  ];
  return manifestHash(tables.map(rows => rows.sort((a, b) => a.id.localeCompare(b.id, 'en'))));
}

async function reservationFingerprint(client: Prisma.TransactionClient): Promise<string> {
  return manifestHash([
    await client.booking.findMany({ orderBy: { id: 'asc' } }),
    await client.hold.findMany({ orderBy: { id: 'asc' } }),
    await client.bookingPolicy.findMany({ orderBy: { id: 'asc' } }),
  ]);
}

export const ALLOWED_CONFIG_TABLES = [
  'Questionnaire',
  'Service',
  'Price',
  'Package',
  'PackageItem',
  'DayCapacity',
  'Slot',
] as const;

export const RESTRICTED_TRANSACTIONAL_TABLES = [
  'BookingPolicy',
  'Patient',
  'Registration',
  'Booking',
  'Hold',
  'Quote',
  'User',
  'Session',
  'Verification',
  'StaffPasswordReset',
  'MfaRecoveryCode',
  'ChatAgent',
  'RateLimit',
  'ContactRequest',
  'Waitlist',
] as const;

export interface PromotionOptions {
  dryRun: boolean;
  apply: boolean;
  promoteApprovedPrices: boolean;
  includeUatServices: boolean;
  manifestFile: string;
  manifestChecksum?: string;
}

export interface TableProjection {
  table: string;
  sourceCount: number;
  approvedCount: number;
  targetBeforeCount: number;
  toInsert: number;
  toUpdate: number;
  toSkip: number;
  projectedTargetCount: number;
}

export interface RecordManifestItem {
  table: string;
  sourceId: string;
  businessKey: string;
  action: 'INSERT' | 'UPDATE' | 'SKIP' | 'REQUIRE_REVIEW';
  approvalStatus: string;
  destinationConflict: boolean;
  details: string;
}

export interface ExcludedItem {
  table: string;
  identifier: string;
  reason: string;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): PromotionOptions {
  const dryRun = argv.includes('--dry-run');
  const apply = argv.includes('--apply');
  const promoteApprovedPrices = argv.includes('--promote-approved-prices');
  const includeUatServices = argv.includes('--include-uat-services');

  let manifestFile = process.env.MANIFEST_FILE || 'promotion-manifest.json';
  let manifestChecksum: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith('--manifest-file=')) {
      manifestFile = arg.split('=')[1];
    } else if (arg.startsWith('--manifest-checksum=')) {
      manifestChecksum = arg.split('=')[1];
    }
  }

  if (dryRun === apply) {
    throw new Error('You must specify exactly one of --dry-run or --apply');
  }

  if (apply && !manifestChecksum) {
    throw new Error('--apply requires --manifest-checksum=<SHA256> generated during --dry-run');
  }

  if (includeUatServices) {
    throw new Error('UAT/DEMO promotion is forbidden; remove --include-uat-services');
  }

  return { dryRun, apply, promoteApprovedPrices, includeUatServices, manifestFile, manifestChecksum };
}

export function getDatabaseName(urlString: string): string {
  try {
    const u = new URL(urlString);
    return decodeURIComponent(u.pathname.replace(/^\//, ''));
  } catch {
    return 'unknown';
  }
}

export function maskDatabaseUrl(urlString: string): string {
  try {
    const u = new URL(urlString);
    u.password = '***';
    return u.toString();
  } catch {
    return '***';
  }
}

export function validateDatabaseTargets(
  sourceUrl: string,
  targetUrl: string,
  allowTestDatabases: boolean = process.env.ALLOW_TEST_DATABASES === 'true'
): { sourceDbName: string; targetDbName: string } {
  if (!sourceUrl) {
    throw new Error('Missing SOURCE_DATABASE_URL (or STAGING_DATABASE_URL).');
  }
  if (!targetUrl) {
    throw new Error('Missing TARGET_DATABASE_URL (or DATABASE_URL).');
  }

  const sourceDbName = getDatabaseName(sourceUrl);
  const targetDbName = getDatabaseName(targetUrl);

  for (const value of [sourceUrl, targetUrl]) {
    const parsed = new URL(value);
    if (parsed.protocol !== 'mysql:' || !parsed.hostname || !parsed.username || parsed.hash) {
      throw new Error('Explicit MySQL database identity required');
    }
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
      throw new Error('Production promotion requires the allowlisted local MySQL host');
    }
  }

  if (sourceUrl === targetUrl || sourceDbName === targetDbName) {
    throw new Error('Source and Target database URLs resolve to the same database! Aborting to prevent corruption.');
  }

  if (!allowTestDatabases) {
    if (sourceDbName !== 'pdh_healthcheck_staging') {
      throw new Error(`SAFETY VIOLATION: Source database must be exactly 'pdh_healthcheck_staging' (got '${sourceDbName}'). Aborting.`);
    }
    if (targetDbName !== 'pdh_healthcheck') {
      throw new Error(`SAFETY VIOLATION: Target database must be exactly 'pdh_healthcheck' (got '${targetDbName}'). Aborting.`);
    }
  } else if (![sourceDbName, targetDbName].every(name => /^(?:test_[a-z0-9_]+|[a-z0-9_]+_test)$/.test(name))) {
    throw new Error('Test promotion requires two explicitly named isolated test databases');
  }

  return { sourceDbName, targetDbName };
}

export function isUatOrDemoService(service: {
  code: string;
  nameTh?: string | null;
  nameEn?: string | null;
}): boolean {
  const codeUpper = (service.code || '').toUpperCase();
  if (codeUpper.startsWith('UAT-') || codeUpper.startsWith('DEMO-')) {
    return true;
  }
  const nameTh = service.nameTh || '';
  if (nameTh.includes('(จำลอง)') || nameTh.includes('จำลอง') || nameTh.includes('สาธิต') || nameTh.toUpperCase().includes('UAT') || nameTh.toUpperCase().includes('DEMO')) {
    return true;
  }
  const nameEnUpper = (service.nameEn || '').toUpperCase();
  if (nameEnUpper.includes('UAT') || nameEnUpper.includes('DEMO') || nameEnUpper.includes('MOCK') || nameEnUpper.includes('SYNTHETIC')) {
    return true;
  }
  return false;
}

export function filterServices<T extends {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string;
  category: string;
  unit: string;
  active: boolean;
  requiresReview: boolean;
  preparation?: string | null;
  componentCodes: unknown;
  revision: number;
}>(
  sourceServices: T[],
  includeUat: boolean = false
): { approvedServices: T[]; excludedServices: ExcludedItem[] } {
  const approvedServices: T[] = [];
  const excludedServices: ExcludedItem[] = [];

  for (const s of sourceServices) {
    if (!includeUat && isUatOrDemoService(s)) {
      excludedServices.push({
        table: 'Service',
        identifier: s.code,
        reason: 'UAT/DEMO mock service excluded by default to prevent non-hospital items in Production',
      });
      continue;
    }

    if (!s.active) {
      excludedServices.push({
        table: 'Service',
        identifier: s.code,
        reason: 'Inactive service (active=false) excluded from promotion',
      });
      continue;
    }

    if (!s.code || !s.nameTh || !s.category) {
      excludedServices.push({
        table: 'Service',
        identifier: s.code || s.id,
        reason: 'Incomplete service metadata (missing code, nameTh, or category)',
      });
      continue;
    }

    approvedServices.push(s);
  }

  return { approvedServices, excludedServices };
}

export function filterPrices<
  P extends {
    id: string;
    serviceId: string;
    amount: Prisma.Decimal | number | string;
    version: number;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    approvedBy: string | null;
    importId?: string | null;
  },
  S extends { id: string; code: string }
>(
  sourcePrices: P[],
  sourceServices: S[],
  targetServices: S[],
  approvedServices: S[],
  promoteApprovedPrices: boolean
): { approvedPrices: P[]; excludedPrices: ExcludedItem[] } {
  const approvedPrices: P[] = [];
  const excludedPrices: ExcludedItem[] = [];

  const sourceServiceMap = new Map(sourceServices.map(s => [s.id, s]));
  const targetCodeSet = new Set(targetServices.map(s => s.code));
  const approvedCodeSet = new Set(approvedServices.map(s => s.code));

  for (const p of sourcePrices) {
    const s = sourceServiceMap.get(p.serviceId);
    const sCode = s ? s.code : `unknown-id-${p.serviceId}`;

    if (!promoteApprovedPrices) {
      excludedPrices.push({
        table: 'Price',
        identifier: `${sCode}_v${p.version}`,
        reason: 'Price promotion not enabled (--promote-approved-prices flag omitted)',
      });
      continue;
    }

    if (!s) {
      excludedPrices.push({
        table: 'Price',
        identifier: `serviceId_${p.serviceId}_v${p.version}`,
        reason: 'Referenced service not found in source database',
      });
      continue;
    }

    if (!p.approvedBy || p.approvedBy.trim() === '') {
      excludedPrices.push({
        table: 'Price',
        identifier: `${sCode}_v${p.version}`,
        reason: 'Missing approvedBy: official hospital price list requires formal approval attribution',
      });
      continue;
    }

    const effFrom = new Date(p.effectiveFrom);
    if (isNaN(effFrom.getTime())) {
      excludedPrices.push({
        table: 'Price',
        identifier: `${sCode}_v${p.version}`,
        reason: 'Invalid effectiveFrom date',
      });
      continue;
    }

    if (p.effectiveTo) {
      const effTo = new Date(p.effectiveTo);
      if (isNaN(effTo.getTime()) || effTo <= effFrom) {
        excludedPrices.push({
          table: 'Price',
          identifier: `${sCode}_v${p.version}`,
          reason: 'Invalid effective date range: effectiveTo must be chronologically after effectiveFrom',
        });
        continue;
      }
    }

    if (Number(p.amount) < 0) {
      excludedPrices.push({
        table: 'Price',
        identifier: `${sCode}_v${p.version}`,
        reason: 'Invalid negative price amount',
      });
      continue;
    }

    // Must map to an approved service (either in Target or being promoted in approvedServices)
    const existsInTargetOrApproved = targetCodeSet.has(s.code) || approvedCodeSet.has(s.code);
    if (!existsInTargetOrApproved) {
      excludedPrices.push({
        table: 'Price',
        identifier: `${sCode}_v${p.version}`,
        reason: `Referenced service '${s.code}' is excluded (e.g. UAT mock) or not present in Production`,
      });
      continue;
    }

    approvedPrices.push(p);
  }

  return { approvedPrices, excludedPrices };
}

export function filterPackagesAndItems<
  PKG extends {
    id: string;
    key: string;
    version: number;
    name: string;
    status: string;
    approvedBy: string | null;
    fixedPrice: Prisma.Decimal | number | string;
  },
  PI extends {
    id: string;
    packageId: string;
    serviceId: string;
    position: number;
    mode: string;
  },
  S extends { id: string; code: string; nameTh?: string | null; nameEn?: string | null }
>(
  sourcePackages: PKG[],
  sourcePackageItems: PI[],
  sourceServices: S[],
  approvedServices: S[],
  targetServices: S[],
  includeUat: boolean = false
): {
  approvedPackages: PKG[];
  approvedPackageItems: PI[];
  excludedPackages: ExcludedItem[];
  excludedPackageItems: ExcludedItem[];
} {
  const approvedPackages: PKG[] = [];
  const excludedPackages: ExcludedItem[] = [];
  const approvedPackageItems: PI[] = [];
  const excludedPackageItems: ExcludedItem[] = [];

  const sourceServiceMap = new Map(sourceServices.map(s => [s.id, s]));
  const targetServiceCodeSet = new Set(targetServices.map(s => s.code));
  const approvedServiceCodeSet = new Set(approvedServices.map(s => s.code));

  // Group items by packageId
  const itemsByPkg = new Map<string, PI[]>();
  for (const item of sourcePackageItems) {
    const list = itemsByPkg.get(item.packageId) || [];
    list.push(item);
    itemsByPkg.set(item.packageId, list);
  }

  for (const pkg of sourcePackages) {
    if (pkg.status !== 'published') {
      excludedPackages.push({
        table: 'Package',
        identifier: `${pkg.key}_v${pkg.version}`,
        reason: `Package is not published (current status: '${pkg.status}')`,
      });
      continue;
    }

    if (!pkg.approvedBy || pkg.approvedBy.trim() === '') {
      excludedPackages.push({
        table: 'Package',
        identifier: `${pkg.key}_v${pkg.version}`,
        reason: 'Package lacks approvedBy signature',
      });
      continue;
    }

    const items = itemsByPkg.get(pkg.id) || [];
    let hasUatService = false;
    let uatServiceName = '';

    for (const item of items) {
      const s = sourceServiceMap.get(item.serviceId);
      if (!s) {
        throw new Error(
          `Referential integrity corruption in source database: PackageItem ${item.id} references non-existent serviceId '${item.serviceId}'`
        );
      }
      if (!includeUat && isUatOrDemoService(s)) {
        hasUatService = true;
        uatServiceName = s.code;
        break;
      }
    }

    if (hasUatService) {
      excludedPackages.push({
        table: 'Package',
        identifier: `${pkg.key}_v${pkg.version}`,
        reason: `Package references UAT-only service '${uatServiceName}'. Excluded to protect Production integrity.`,
      });
      for (const item of items) {
        excludedPackageItems.push({
          table: 'PackageItem',
          identifier: `${pkg.key}_v${pkg.version} -> serviceId:${item.serviceId}`,
          reason: `Parent package '${pkg.key}_v${pkg.version}' excluded due to UAT service reference`,
        });
      }
      continue;
    }

    // Validate that every referenced service can be resolved in Target
    for (const item of items) {
      const s = sourceServiceMap.get(item.serviceId)!;
      const resolvable = targetServiceCodeSet.has(s.code) || approvedServiceCodeSet.has(s.code);
      if (!resolvable) {
        throw new Error(
          `Integrity violation: Package '${pkg.name}' (${pkg.key}_v${pkg.version}) item references service '${s.code}' which does not exist in Target and is not in approved imports. Promotion aborted before writing.`
        );
      }
    }

    approvedPackages.push(pkg);
    approvedPackageItems.push(...items);
  }

  return {
    approvedPackages,
    approvedPackageItems,
    excludedPackages,
    excludedPackageItems,
  };
}

export function validateSlotReservationPreservation(
  stagingCapacity: number,
  stagingClosed: boolean,
  targetSlot: {
    capacity: number;
    reservedCapacity: number;
    closed: boolean;
    _count?: { bookings: number; holds: number };
  }
): { safeCapacity: number; safeReserved: number; conflict: boolean; details: string } {
  const existingBookings = targetSlot._count?.bookings ?? 0;
  const existingHolds = targetSlot._count?.holds ?? 0;
  const activeReservations = existingBookings + existingHolds;

  // Reserved capacity must never drop below active reservations or existing recorded reservedCapacity
  const safeReserved = Math.max(targetSlot.reservedCapacity, activeReservations);
  if (stagingClosed && !targetSlot.closed && safeReserved > 0) {
    throw new Error('Cannot close a production slot with reservations');
  }
  // Total capacity must never drop below active reservations or safeReserved
  const safeCapacity = Math.max(stagingCapacity, safeReserved);

  const isIdentical =
    targetSlot.capacity === safeCapacity &&
    targetSlot.reservedCapacity === safeReserved &&
    targetSlot.closed === stagingClosed;

  const details = isIdentical
    ? `Slot identical in Production (Cap: ${safeCapacity}, Reserved: ${safeReserved})`
    : `Preserve reservedCapacity (${safeReserved}), active reservations (${existingBookings} bookings, ${existingHolds} holds); adjust capacity to ${safeCapacity}`;

  return {
    safeCapacity,
    safeReserved,
    conflict: !isIdentical,
    details,
  };
}

export async function runPromotion(options: PromotionOptions) {
  const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.STAGING_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

  const { sourceDbName, targetDbName } = validateDatabaseTargets(sourceUrl || '', targetUrl || '');

  console.log('======================================================================');
  console.log('🚀 PDH SMART HEALTH CHECK — CONFIGURATION DATA PROMOTION RUNNER');
  console.log('======================================================================');
  console.log(`Mode:                     ${options.apply ? '⚡ APPLY (TRANSACTIONAL)' : '🔍 DRY-RUN (READ-ONLY)'}`);
  console.log(`Source Database:          ${sourceDbName} (${maskDatabaseUrl(sourceUrl!)})`);
  console.log(`Target Database:          ${targetDbName} (${maskDatabaseUrl(targetUrl!)})`);
  console.log(`Promote Prices Opt-In:    ${options.promoteApprovedPrices ? 'YES' : 'NO (Skipping unapproved pricing)'}`);
  console.log(`Include UAT Mock Items:   ${options.includeUatServices ? 'YES' : 'NO (Strictly excluding UAT-* / DEMO-*)'}`);
  console.log(`Manifest File:            ${options.manifestFile}`);
  console.log('----------------------------------------------------------------------');

  const sourceDb = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
  const targetDb = new PrismaClient({ datasources: { db: { url: targetUrl } } });

  try {
    // Connectivity check
    await sourceDb.$queryRaw`SELECT 1`;
    await targetDb.$queryRaw`SELECT 1`;
    console.log('✔ Connected to Source and Target databases successfully.\n');

    if (options.includeUatServices) throw new Error('UAT/DEMO promotion is forbidden');
    const sourceIdentity = await sourceDb.$queryRaw<Array<{ databaseName: string; serverUuid: string }>>`SELECT DATABASE() AS databaseName, @@server_uuid AS serverUuid`;
    const targetIdentity = await targetDb.$queryRaw<Array<{ databaseName: string; serverUuid: string }>>`SELECT DATABASE() AS databaseName, @@server_uuid AS serverUuid`;
    if (sourceIdentity[0]?.databaseName !== sourceDbName || targetIdentity[0]?.databaseName !== targetDbName) {
      throw new Error('Connected MySQL identity differs from approved database names');
    }
    const sourceFingerprint = await configurationFingerprint(sourceDb);
    const targetFingerprint = await configurationFingerprint(targetDb);
    const reservationsFingerprint = await reservationFingerprint(targetDb);

    // Capture Target Baseline State (all critical transactional and config counts)
    const targetBaselineState = {
      questionnaires: await targetDb.questionnaire.count(),
      services: await targetDb.service.count(),
      prices: await targetDb.price.count(),
      packages: await targetDb.package.count(),
      packageItems: await targetDb.packageItem.count(),
      dayCapacities: await targetDb.dayCapacity.count(),
      slots: await targetDb.slot.count(),
      // Transactional tables MUST NOT change during promotion
      bookings: await targetDb.booking.count(),
      patients: await targetDb.patient.count(),
      registrations: await targetDb.registration.count(),
      holds: await targetDb.hold.count(),
      quotes: await targetDb.quote.count(),
      users: await targetDb.user.count(),
      sessions: await targetDb.session.count(),
      bookingPolicies: await targetDb.bookingPolicy.count(),
    };

    const recordManifest: RecordManifestItem[] = [];
    const projections: TableProjection[] = [];
    const allExcludedItems: ExcludedItem[] = [];

    // --- 1. QUESTIONNAIRE ---
    const allSourceQ = await sourceDb.questionnaire.findMany({ orderBy: { version: 'asc' } });
    const approvedQ = allSourceQ.filter(q => q.status === 'published' && Boolean(q.approvedBy?.trim()));
    const targetQ = await targetDb.questionnaire.findMany();
    const targetQMap = new Map(targetQ.map(q => [q.version, q]));

    let qIns = 0, qUpd = 0, qSkip = 0;
    for (const q of approvedQ) {
      const existing = targetQMap.get(q.version);
      if (!existing) {
        qIns++;
        recordManifest.push({
          table: 'Questionnaire',
          sourceId: q.id,
          businessKey: `v${q.version}`,
          action: 'INSERT',
          approvalStatus: q.status === 'published' ? 'PUBLISHED' : 'APPROVED',
          destinationConflict: false,
          details: `New version ${q.version}`,
        });
      } else {
        const matching =
          JSON.stringify(q.questions) === JSON.stringify(existing.questions) &&
          JSON.stringify(q.rules) === JSON.stringify(existing.rules) &&
          q.status === existing.status;
        if (matching) {
          qSkip++;
          recordManifest.push({
            table: 'Questionnaire',
            sourceId: q.id,
            businessKey: `v${q.version}`,
            action: 'SKIP',
            approvalStatus: q.status,
            destinationConflict: false,
            details: `Version ${q.version} already identical in Production`,
          });
        } else {
          qUpd++;
          recordManifest.push({
            table: 'Questionnaire',
            sourceId: q.id,
            businessKey: `v${q.version}`,
            action: 'UPDATE',
            approvalStatus: q.status,
            destinationConflict: true,
            details: `Version ${q.version} content or status updated`,
          });
        }
      }
    }
    projections.push({
      table: 'Questionnaire',
      sourceCount: allSourceQ.length,
      approvedCount: approvedQ.length,
      targetBeforeCount: targetQ.length,
      toInsert: qIns,
      toUpdate: qUpd,
      toSkip: qSkip,
      projectedTargetCount: targetQ.length + qIns,
    });

    // --- 2. SERVICE ---
    const allSourceServices = await sourceDb.service.findMany({ orderBy: { code: 'asc' } });
    const { approvedServices, excludedServices } = filterServices(allSourceServices, options.includeUatServices);
    allExcludedItems.push(...excludedServices);

    const targetServices = await targetDb.service.findMany();
    const targetServiceMap = new Map(targetServices.map(s => [s.code, s]));

    let sIns = 0, sUpd = 0, sSkip = 0;
    for (const s of approvedServices) {
      const existing = targetServiceMap.get(s.code);
      if (!existing) {
        sIns++;
        recordManifest.push({
          table: 'Service',
          sourceId: s.id,
          businessKey: s.code,
          action: 'INSERT',
          approvalStatus: s.active ? 'ACTIVE' : 'INACTIVE',
          destinationConflict: false,
          details: `${s.nameTh} (${s.code})`,
        });
      } else if (
        existing.nameTh === s.nameTh &&
        existing.nameEn === s.nameEn &&
        existing.category === s.category &&
        existing.unit === s.unit &&
        existing.active === s.active &&
        existing.requiresReview === s.requiresReview &&
        (existing.preparation || '') === (s.preparation || '')
      ) {
        sSkip++;
        recordManifest.push({
          table: 'Service',
          sourceId: s.id,
          businessKey: s.code,
          action: 'SKIP',
          approvalStatus: s.active ? 'ACTIVE' : 'INACTIVE',
          destinationConflict: false,
          details: `Service ${s.code} identical in Production`,
        });
      } else {
        sUpd++;
        recordManifest.push({
          table: 'Service',
          sourceId: s.id,
          businessKey: s.code,
          action: 'UPDATE',
          approvalStatus: s.active ? 'ACTIVE' : 'INACTIVE',
          destinationConflict: true,
          details: `Update service ${s.code}`,
        });
      }
    }
    projections.push({
      table: 'Service',
      sourceCount: allSourceServices.length,
      approvedCount: approvedServices.length,
      targetBeforeCount: targetServices.length,
      toInsert: sIns,
      toUpdate: sUpd,
      toSkip: sSkip,
      projectedTargetCount: targetServices.length + sIns,
    });

    // --- 3. PRICE (Strictly Opt-in & Business Key Resolution) ---
    const allSourcePrices = await sourceDb.price.findMany({ orderBy: [{ serviceId: 'asc' }, { version: 'asc' }] });
    const { approvedPrices, excludedPrices } = filterPrices(
      allSourcePrices,
      allSourceServices,
      targetServices,
      approvedServices,
      options.promoteApprovedPrices
    );
    allExcludedItems.push(...excludedPrices);

    const targetPrices = await targetDb.price.findMany();
    // Map target prices by `${serviceId}_${version}`
    const targetPriceMap = new Map(targetPrices.map(p => [`${p.serviceId}_${p.version}`, p]));
    const sourceServiceIdToCode = new Map(allSourceServices.map(s => [s.id, s.code]));

    let pIns = 0, pUpd = 0, pSkip = 0;
    for (const p of approvedPrices) {
      const sCode = sourceServiceIdToCode.get(p.serviceId)!;
      const existingTargetService = targetServiceMap.get(sCode);

      if (existingTargetService) {
        const existingPrice = targetPriceMap.get(`${existingTargetService.id}_${p.version}`);
        if (!existingPrice) {
          pIns++;
          recordManifest.push({
            table: 'Price',
            sourceId: p.id,
            businessKey: `${sCode}_v${p.version}`,
            action: 'INSERT',
            approvalStatus: `APPROVED_BY_${p.approvedBy}`,
            destinationConflict: false,
            details: `${p.amount} THB (Eff: ${p.effectiveFrom.toISOString().slice(0, 10)})`,
          });
        } else {
          const sameAmount = Number(existingPrice.amount) === Number(p.amount);
          const sameEffFrom = existingPrice.effectiveFrom.toISOString() === p.effectiveFrom.toISOString();
          const sameEffTo = (existingPrice.effectiveTo?.toISOString() || null) === (p.effectiveTo?.toISOString() || null);

          if (sameAmount && sameEffFrom && sameEffTo) {
            pSkip++;
            recordManifest.push({
              table: 'Price',
              sourceId: p.id,
              businessKey: `${sCode}_v${p.version}`,
              action: 'SKIP',
              approvalStatus: `APPROVED_BY_${p.approvedBy}`,
              destinationConflict: false,
              details: `Price ${sCode}_v${p.version} identical in Production (${p.amount} THB)`,
            });
          } else {
            pUpd++;
            recordManifest.push({
              table: 'Price',
              sourceId: p.id,
              businessKey: `${sCode}_v${p.version}`,
              action: 'UPDATE',
              approvalStatus: `APPROVED_BY_${p.approvedBy}`,
              destinationConflict: true,
              details: `Update price ${sCode}_v${p.version}: ${existingPrice.amount} -> ${p.amount} THB`,
            });
          }
        }
      } else {
        // Service is being newly inserted in this run
        pIns++;
        recordManifest.push({
          table: 'Price',
          sourceId: p.id,
          businessKey: `${sCode}_v${p.version}`,
          action: 'INSERT',
          approvalStatus: `APPROVED_BY_${p.approvedBy}`,
          destinationConflict: false,
          details: `Initial price for newly promoted service ${sCode}: ${p.amount} THB`,
        });
      }
    }
    projections.push({
      table: 'Price',
      sourceCount: allSourcePrices.length,
      approvedCount: approvedPrices.length,
      targetBeforeCount: targetPrices.length,
      toInsert: pIns,
      toUpdate: pUpd,
      toSkip: pSkip,
      projectedTargetCount: targetPrices.length + pIns,
    });

    // --- 4. PACKAGE & PACKAGEITEM ---
    const allSourcePackages = await sourceDb.package.findMany({ orderBy: [{ key: 'asc' }, { version: 'asc' }] });
    const allSourcePackageItems = await sourceDb.packageItem.findMany({ orderBy: [{ packageId: 'asc' }, { position: 'asc' }] });

    const {
      approvedPackages,
      approvedPackageItems,
      excludedPackages,
      excludedPackageItems,
    } = filterPackagesAndItems(
      allSourcePackages,
      allSourcePackageItems,
      allSourceServices,
      approvedServices,
      targetServices,
      options.includeUatServices
    );
    allExcludedItems.push(...excludedPackages, ...excludedPackageItems);

    const targetPackages = await targetDb.package.findMany();
    const targetPkgMap = new Map(targetPackages.map(p => [`${p.key}_${p.version}`, p]));

    let pkgIns = 0, pkgUpd = 0, pkgSkip = 0;
    for (const pkg of approvedPackages) {
      const existing = targetPkgMap.get(`${pkg.key}_${pkg.version}`);
      if (!existing) {
        pkgIns++;
        recordManifest.push({
          table: 'Package',
          sourceId: pkg.id,
          businessKey: `${pkg.key}_v${pkg.version}`,
          action: 'INSERT',
          approvalStatus: 'PUBLISHED',
          destinationConflict: false,
          details: `${pkg.name} (${pkg.fixedPrice} THB)`,
        });
      } else if (
        existing.name === pkg.name &&
        Number(existing.fixedPrice) === Number(pkg.fixedPrice) &&
        existing.status === pkg.status &&
        existing.audience === pkg.audience &&
        existing.minAge === pkg.minAge &&
        existing.maxAge === pkg.maxAge
      ) {
        pkgSkip++;
        recordManifest.push({
          table: 'Package',
          sourceId: pkg.id,
          businessKey: `${pkg.key}_v${pkg.version}`,
          action: 'SKIP',
          approvalStatus: 'PUBLISHED',
          destinationConflict: false,
          details: `Package ${pkg.name} identical in Production`,
        });
      } else {
        pkgUpd++;
        recordManifest.push({
          table: 'Package',
          sourceId: pkg.id,
          businessKey: `${pkg.key}_v${pkg.version}`,
          action: 'UPDATE',
          approvalStatus: 'PUBLISHED',
          destinationConflict: true,
          details: `Update package ${pkg.name}`,
        });
      }
    }
    projections.push({
      table: 'Package',
      sourceCount: allSourcePackages.length,
      approvedCount: approvedPackages.length,
      targetBeforeCount: targetPackages.length,
      toInsert: pkgIns,
      toUpdate: pkgUpd,
      toSkip: pkgSkip,
      projectedTargetCount: targetPackages.length + pkgIns,
    });

    // --- 5. PACKAGE ITEM (Business Key Resolution) ---
    const targetPkgItems = await targetDb.packageItem.findMany();
    const sourcePkgMap = new Map(allSourcePackages.map(p => [p.id, p]));

    let piIns = 0, piUpd = 0, piSkip = 0;
    for (const item of approvedPackageItems) {
      const pkg = sourcePkgMap.get(item.packageId)!;
      const sCode = sourceServiceIdToCode.get(item.serviceId)!;

      const targetPkg = targetPkgMap.get(`${pkg.key}_${pkg.version}`);
      const targetSvc = targetServiceMap.get(sCode);

      if (targetPkg && targetSvc) {
        const existingItem = targetPkgItems.find(i => i.packageId === targetPkg.id && i.serviceId === targetSvc.id);
        if (existingItem) {
          if (existingItem.position === item.position && existingItem.mode === item.mode) {
            piSkip++;
            recordManifest.push({
              table: 'PackageItem',
              sourceId: item.id,
              businessKey: `${pkg.key}_v${pkg.version} -> ${sCode}`,
              action: 'SKIP',
              approvalStatus: 'APPROVED_PACKAGE_ITEM',
              destinationConflict: false,
              details: `Link identical in Production (Pos: ${item.position}, Mode: ${item.mode})`,
            });
          } else {
            piUpd++;
            recordManifest.push({
              table: 'PackageItem',
              sourceId: item.id,
              businessKey: `${pkg.key}_v${pkg.version} -> ${sCode}`,
              action: 'UPDATE',
              approvalStatus: 'APPROVED_PACKAGE_ITEM',
              destinationConflict: true,
              details: `Update position/mode (${existingItem.position}->${item.position}, ${existingItem.mode}->${item.mode})`,
            });
          }
        } else {
          piIns++;
          recordManifest.push({
            table: 'PackageItem',
            sourceId: item.id,
            businessKey: `${pkg.key}_v${pkg.version} -> ${sCode}`,
            action: 'INSERT',
            approvalStatus: 'APPROVED_PACKAGE_ITEM',
            destinationConflict: false,
            details: `Add service ${sCode} to package ${pkg.key}_v${pkg.version} (Pos: ${item.position})`,
          });
        }
      } else {
        // Brand new package or brand new service
        piIns++;
        recordManifest.push({
          table: 'PackageItem',
          sourceId: item.id,
          businessKey: `${pkg.key}_v${pkg.version} -> ${sCode}`,
          action: 'INSERT',
          approvalStatus: 'APPROVED_PACKAGE_ITEM',
          destinationConflict: false,
          details: `Add service ${sCode} to new package ${pkg.key}_v${pkg.version}`,
        });
      }
    }
    projections.push({
      table: 'PackageItem',
      sourceCount: allSourcePackageItems.length,
      approvedCount: approvedPackageItems.length,
      targetBeforeCount: targetPkgItems.length,
      toInsert: piIns,
      toUpdate: piUpd,
      toSkip: piSkip,
      projectedTargetCount: targetPkgItems.length + piIns,
    });

    // --- 6. DAY CAPACITY ---
    const allSourceCapacities = await sourceDb.dayCapacity.findMany({ orderBy: { id: 'asc' } });
    const todayBangkok = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const approvedCapacities = allSourceCapacities.filter(c => c.id >= todayBangkok);
    const targetCapacities = await targetDb.dayCapacity.findMany();
    const targetCapMap = new Map(targetCapacities.map(c => [c.id, c]));

    let dcIns = 0, dcUpd = 0, dcSkip = 0;
    for (const cap of approvedCapacities) {
      const existing = targetCapMap.get(cap.id);
      if (existing && (existing.capacity !== cap.capacity || existing.blackout !== cap.blackout)) {
        const occupied = await targetDb.slot.findFirst({
          where: { dayId: cap.id, OR: [{ reservedCapacity: { gt: 0 } }, { bookings: { some: {} } }, { holds: { some: {} } }] },
          select: { id: true },
        });
        if (occupied) throw new Error('Occupied production day requires manual capacity review before promotion');
      }
      if (!existing) {
        dcIns++;
        recordManifest.push({
          table: 'DayCapacity',
          sourceId: cap.id,
          businessKey: cap.id,
          action: 'INSERT',
          approvalStatus: cap.blackout ? 'BLACKOUT' : 'OPEN',
          destinationConflict: false,
          details: `Date: ${cap.id}, Cap: ${cap.capacity}`,
        });
      } else if (existing.capacity === cap.capacity && existing.blackout === cap.blackout) {
        dcSkip++;
        recordManifest.push({
          table: 'DayCapacity',
          sourceId: cap.id,
          businessKey: cap.id,
          action: 'SKIP',
          approvalStatus: cap.blackout ? 'BLACKOUT' : 'OPEN',
          destinationConflict: false,
          details: `Date: ${cap.id} identical in Production`,
        });
      } else {
        dcUpd++;
        recordManifest.push({
          table: 'DayCapacity',
          sourceId: cap.id,
          businessKey: cap.id,
          action: 'UPDATE',
          approvalStatus: cap.blackout ? 'BLACKOUT' : 'OPEN',
          destinationConflict: true,
          details: `Update date ${cap.id}: Cap ${existing.capacity}->${cap.capacity}, Blackout ${existing.blackout}->${cap.blackout}`,
        });
      }
    }
    projections.push({
      table: 'DayCapacity',
      sourceCount: allSourceCapacities.length,
      approvedCount: approvedCapacities.length,
      targetBeforeCount: targetCapacities.length,
      toInsert: dcIns,
      toUpdate: dcUpd,
      toSkip: dcSkip,
      projectedTargetCount: targetCapacities.length + dcIns,
    });

    // --- 7. SLOT (With Preservation of Reservations) ---
    const approvedCapIds = new Set(approvedCapacities.map(c => c.id));
    const allSourceSlots = await sourceDb.slot.findMany({ orderBy: { startsAt: 'asc' } });
    const approvedSlots = allSourceSlots.filter(s => approvedCapIds.has(s.dayId));
    const targetSlots = await targetDb.slot.findMany({
      include: { _count: { select: { bookings: true, holds: true } } },
    });
    const targetSlotMap = new Map(targetSlots.map(s => [s.startsAt.toISOString(), s]));

    let slotIns = 0, slotUpd = 0, slotSkip = 0;
    for (const slot of approvedSlots) {
      const existing = targetSlotMap.get(slot.startsAt.toISOString());
      if (!existing) {
        slotIns++;
        recordManifest.push({
          table: 'Slot',
          sourceId: slot.id,
          businessKey: slot.startsAt.toISOString(),
          action: 'INSERT',
          approvalStatus: slot.closed ? 'CLOSED' : 'OPEN',
          destinationConflict: false,
          details: `Starts: ${slot.startsAt.toISOString()}, Cap: ${slot.capacity}, Initial Reserved: 0`,
        });
      } else {
        if (existing.dayId !== slot.dayId || existing.endsAt.getTime() !== slot.endsAt.getTime()) {
          throw new Error('Slot time/day conflict requires manual resolution before promotion');
        }
        const check = validateSlotReservationPreservation(slot.capacity, slot.closed, existing);
        if (check.conflict) {
          slotUpd++;
          recordManifest.push({
            table: 'Slot',
            sourceId: slot.id,
            businessKey: slot.startsAt.toISOString(),
            action: 'UPDATE',
            approvalStatus: slot.closed ? 'CLOSED' : 'OPEN',
            destinationConflict: true,
            details: check.details,
          });
        } else {
          slotSkip++;
          recordManifest.push({
            table: 'Slot',
            sourceId: slot.id,
            businessKey: slot.startsAt.toISOString(),
            action: 'SKIP',
            approvalStatus: slot.closed ? 'CLOSED' : 'OPEN',
            destinationConflict: false,
            details: check.details,
          });
        }
      }
    }
    projections.push({
      table: 'Slot',
      sourceCount: allSourceSlots.length,
      approvedCount: approvedSlots.length,
      targetBeforeCount: targetSlots.length,
      toInsert: slotIns,
      toUpdate: slotUpd,
      toSkip: slotSkip,
      projectedTargetCount: targetSlots.length + slotIns,
    });

    // Summary Table
    console.log('📋 DATA PROMOTION MANIFEST PROJECTION:\n');
    console.table(projections);

    // List of Reviewed Conflicts
    const conflicts = recordManifest.filter(r => r.destinationConflict);
    if (conflicts.some(record => ['Questionnaire', 'Price', 'Package', 'PackageItem'].includes(record.table))) {
      throw new Error('Published version conflict: create a new approved version instead of overwriting production history');
    }
    if (conflicts.length > 0) {
      console.log(`\n⚠️  PRODUCTION CONFLICTS IDENTIFIED (${conflicts.length} items will UPDATE existing Production data):`);
      for (const c of conflicts) {
        console.log(`   - [${c.table}] ${c.businessKey}: ${c.details}`);
      }
    } else {
      console.log('\n✔ Zero destructive conflicts with existing Production data.');
    }

    // List of Excluded Items
    if (allExcludedItems.length > 0) {
      console.log(`\n🛡️  EXCLUSION AUDIT: ${allExcludedItems.length} items excluded with explicit clinical/security reasons:`);
      for (const ex of allExcludedItems.slice(0, 15)) {
        console.log(`   - [${ex.table}] ${ex.identifier}: ${ex.reason}`);
      }
      if (allExcludedItems.length > 15) {
        console.log(`   ... and ${allExcludedItems.length - 15} more excluded items.`);
      }
    }

    // Build Complete Manifest Document
    const manifestDocument = {
      formatVersion: 2,
      sourceIdentity,
      targetIdentity,
      sourceFingerprint,
      targetFingerprint,
      reservationsFingerprint,
      sourceDatabase: sourceDbName,
      targetDatabase: targetDbName,
      options: {
        promoteApprovedPrices: options.promoteApprovedPrices,
        includeUatServices: options.includeUatServices,
      },
      targetBaselineState,
      projections,
      recordManifest: recordManifest.sort((a, b) =>
        `${a.table}:${a.businessKey}`.localeCompare(`${b.table}:${b.businessKey}`, 'en')),
      conflicts,
      excludedItems: allExcludedItems,
      integrityAudit: {
        unresolvedRelationships: 0,
        transactionalTablesUntouched: true,
        bookingPolicyExcluded: true,
        singleTransactionRequired: true,
      },
    };

    const manifestJson = JSON.stringify(manifestDocument, null, 2);
    const manifestChecksum = createHash('sha256').update(manifestJson).digest('hex');

    console.log(`\n🔑 Manifest SHA-256 Checksum: ${manifestChecksum}`);
    if (await configurationFingerprint(sourceDb) !== sourceFingerprint ||
        await configurationFingerprint(targetDb) !== targetFingerprint ||
        await reservationFingerprint(targetDb) !== reservationsFingerprint) {
      throw new Error('Database changed while preparing promotion plan; retry PREPARE');
    }
    if (options.dryRun) {
      writeFileSync(options.manifestFile, manifestJson, { encoding: 'utf8', mode: 0o600 });
    } else {
      // Never overwrite the evidence approved by the operator during APPLY.
      verifyApprovedManifest(readFileSync(options.manifestFile, 'utf8'), options.manifestChecksum!, manifestDocument);
    }

    // Exclusion Guarantee
    console.log('\n🛡️ DATA LEAK PREVENTION AUDIT:');
    console.log('   - BookingPolicy:                          STRICTLY EXCLUDED (Not in promotion scope)');
    console.log('   - Patient / Registration / Booking / Hold: STRICTLY EXCLUDED (0 rows transferred)');
    console.log('   - User / Session / MFA / Credentials:     STRICTLY EXCLUDED (0 rows transferred)');
    console.log('   - Live Appointments in Production:        100% PRESERVED (reservedCapacity never lowered)');

    if (options.dryRun) {
      console.log('\n✔ DRY-RUN COMPLETED SUCCESSFULLY.');
      console.log('  Zero changes were written to Production.');
      console.log(`  To apply after operator approval, provide: --manifest-checksum=${manifestChecksum}`);
      return { manifestChecksum, projections, manifestDocument };
    }

    // --- APPLY MODE (ATOMIC TRANSACTION WITH CHECKSUM GATE) ---
    console.log('\n⚡ VALIDATING APPLY GATES...');

    // 1. Verify Manifest Checksum Match
    if (options.manifestChecksum !== manifestChecksum) {
      throw new Error(
        `CHECKSUM MISMATCH: Provided --manifest-checksum (${options.manifestChecksum}) does not match freshly computed manifest checksum (${manifestChecksum})!`
      );
    }
    console.log('✔ Manifest checksum verified and matched.');

    // 2. Concurrency Safety: Verify Target Database State Has Not Changed
    const currentTargetState = {
      bookings: await targetDb.booking.count(),
      patients: await targetDb.patient.count(),
      users: await targetDb.user.count(),
      registrations: await targetDb.registration.count(),
      holds: await targetDb.hold.count(),
    };

    if (
      currentTargetState.bookings !== targetBaselineState.bookings ||
      currentTargetState.patients !== targetBaselineState.patients ||
      currentTargetState.users !== targetBaselineState.users ||
      currentTargetState.registrations !== targetBaselineState.registrations ||
      currentTargetState.holds !== targetBaselineState.holds
    ) {
      throw new Error(
        'CONCURRENCY SAFETY VIOLATION: Production database state has changed since PREPARE! Aborting apply.'
      );
    }
    console.log('✔ Production database state verified: unchanged since PREPARE baseline.');

    console.log('\n⚡ APPLYING PROMOTION TRANSACTIONALLY...');

    await targetDb.$transaction(
      async (tx) => {
        // Lock capacity in the same order as booking operations. Serializable
        // range locks also protect inserts; lock failures abort the transaction.
        await tx.$queryRaw`SELECT id FROM DayCapacity ORDER BY id FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM Slot ORDER BY id FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM Booking ORDER BY id FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM Hold ORDER BY id FOR UPDATE`;
        if (await configurationFingerprint(tx) !== targetFingerprint ||
            await reservationFingerprint(tx) !== reservationsFingerprint) {
          throw new Error('Target changed since PREPARE; transaction aborted');
        }
        // 1. Questionnaire
        for (const q of approvedQ) {
          await tx.questionnaire.upsert({
            where: { version: q.version },
            create: {
              version: q.version,
              questions: q.questions as Prisma.InputJsonValue,
              rules: q.rules as Prisma.InputJsonValue,
              status: q.status,
              approvedBy: q.approvedBy,
              createdAt: q.createdAt,
              revision: q.revision,
            },
            update: {
              questions: q.questions as Prisma.InputJsonValue,
              rules: q.rules as Prisma.InputJsonValue,
              status: q.status,
              approvedBy: q.approvedBy,
            },
          });
        }

        // 2. Services
        for (const s of approvedServices) {
          await tx.service.upsert({
            where: { code: s.code },
            create: {
              code: s.code,
              nameTh: s.nameTh,
              nameEn: s.nameEn,
              category: s.category,
              unit: s.unit,
              active: s.active,
              requiresReview: s.requiresReview,
              preparation: s.preparation,
              componentCodes: s.componentCodes as Prisma.InputJsonValue,
              revision: s.revision,
            },
            update: {
              nameTh: s.nameTh,
              nameEn: s.nameEn,
              category: s.category,
              unit: s.unit,
              active: s.active,
              requiresReview: s.requiresReview,
              preparation: s.preparation,
              componentCodes: s.componentCodes as Prisma.InputJsonValue,
            },
          });
        }

        // 3. Prices (Strict business key resolution inside transaction)
        if (options.promoteApprovedPrices && approvedPrices.length > 0) {
          const freshTargetServices = await tx.service.findMany();
          const codeToTargetId = new Map(freshTargetServices.map(s => [s.code, s.id]));

          for (const p of approvedPrices) {
            const sCode = sourceServiceIdToCode.get(p.serviceId)!;
            const targetServiceId = codeToTargetId.get(sCode);

            if (!targetServiceId) {
              throw new Error(
                `Referential integrity failure: cannot map price for service code '${sCode}' - service not found in Target database!`
              );
            }

            await tx.price.upsert({
              where: {
                serviceId_version: {
                  serviceId: targetServiceId,
                  version: p.version,
                },
              },
              create: {
                serviceId: targetServiceId,
                amount: p.amount,
                version: p.version,
                effectiveFrom: p.effectiveFrom,
                effectiveTo: p.effectiveTo,
                approvedBy: p.approvedBy!,
                importId: p.importId,
              },
              update: {
                amount: p.amount,
                effectiveFrom: p.effectiveFrom,
                effectiveTo: p.effectiveTo,
                approvedBy: p.approvedBy!,
              },
            });
          }
        }

        // 4. Packages
        for (const pkg of approvedPackages) {
          await tx.package.upsert({
            where: {
              key_version: {
                key: pkg.key,
                version: pkg.version,
              },
            },
            create: {
              key: pkg.key,
              version: pkg.version,
              name: pkg.name,
              description: pkg.description,
              audience: pkg.audience,
              fixedPrice: pkg.fixedPrice,
              minAge: pkg.minAge,
              maxAge: pkg.maxAge,
              preparation: pkg.preparation,
              status: pkg.status,
              effectiveFrom: pkg.effectiveFrom,
              effectiveTo: pkg.effectiveTo,
              approvedBy: pkg.approvedBy,
            },
            update: {
              name: pkg.name,
              description: pkg.description,
              audience: pkg.audience,
              fixedPrice: pkg.fixedPrice,
              minAge: pkg.minAge,
              maxAge: pkg.maxAge,
              preparation: pkg.preparation,
              status: pkg.status,
              effectiveFrom: pkg.effectiveFrom,
              effectiveTo: pkg.effectiveTo,
              approvedBy: pkg.approvedBy,
            },
          });
        }

        // 5. Package Items
        const freshTargetPkgs = await tx.package.findMany();
        const pkgKeyToTargetId = new Map(freshTargetPkgs.map(p => [`${p.key}_${p.version}`, p.id]));
        const freshTargetServices = await tx.service.findMany();
        const codeToTargetServiceId = new Map(freshTargetServices.map(s => [s.code, s.id]));

        for (const item of approvedPackageItems) {
          const pkg = sourcePkgMap.get(item.packageId)!;
          const targetPkgId = pkgKeyToTargetId.get(`${pkg.key}_${pkg.version}`);

          const sCode = sourceServiceIdToCode.get(item.serviceId)!;
          const targetServiceId = codeToTargetServiceId.get(sCode);

          if (!targetPkgId || !targetServiceId) {
            throw new Error(
              `Referential integrity failure: cannot map PackageItem for package ${pkg.key}_v${pkg.version} -> service ${sCode}!`
            );
          }

          await tx.packageItem.upsert({
            where: {
              packageId_serviceId: {
                packageId: targetPkgId,
                serviceId: targetServiceId,
              },
            },
            create: {
              packageId: targetPkgId,
              serviceId: targetServiceId,
              position: item.position,
              mode: item.mode,
            },
            update: {
              position: item.position,
              mode: item.mode,
            },
          });
        }

        // 6. Day Capacities
        for (const cap of approvedCapacities) {
          await tx.dayCapacity.upsert({
            where: { id: cap.id },
            create: {
              id: cap.id,
              capacity: cap.capacity,
              blackout: cap.blackout,
            },
            update: {
              capacity: cap.capacity,
              blackout: cap.blackout,
            },
          });
        }

        // 7. Slots (Preserving existing reservations)
        for (const slot of approvedSlots) {
          const existing = await tx.slot.findUnique({
            where: { startsAt: slot.startsAt },
            include: { _count: { select: { bookings: true, holds: true } } },
          });

          if (existing) {
            const check = validateSlotReservationPreservation(slot.capacity, slot.closed, existing);
            await tx.slot.update({
              where: { id: existing.id },
              data: {
                capacity: check.safeCapacity,
                reservedCapacity: check.safeReserved,
                closed: slot.closed,
              },
            });
          } else {
            await tx.slot.create({
              data: {
                dayId: slot.dayId,
                startsAt: slot.startsAt,
                endsAt: slot.endsAt,
                capacity: slot.capacity,
                reservedCapacity: 0,
                closed: slot.closed,
                revision: 0,
              },
            });
          }
        }

        // Write 1 Audit Log Entry in Target Database
        await tx.audit.create({
          data: {
            actorId: 'staging-to-prod-promotion-tool',
            action: 'data.promotion_applied',
            resourceId: 'master-configuration',
            correlationId: `promo-${Date.now()}`,
            metadata: {
              manifestChecksum,
              sourceDatabase: sourceDbName,
              targetDatabase: targetDbName,
              promotedTables: projections.map(p => ({
                table: p.table,
                inserted: p.toInsert,
                updated: p.toUpdate,
                skipped: p.toSkip,
              })),
            },
          },
        });
      },
      { timeout: 60000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    console.log('\n🎉 PROMOTION APPLIED SUCCESSFULLY IN A SINGLE TRANSACTION!');
    console.log(`   Manifest Checksum: ${manifestChecksum}`);
    console.log('   Audit record created in target database.');
    return { manifestChecksum, projections, manifestDocument };
  } finally {
    await sourceDb.$disconnect();
    await targetDb.$disconnect();
  }
}

async function main() {
  const options = parseArgs();
  await runPromotion(options);
}

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  main().catch((err) => {
    console.error('\n❌ FATAL ERROR DURING DATA PROMOTION:', err.message || err);
    process.exit(1);
  });
}
