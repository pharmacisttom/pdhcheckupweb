/**
 * PDH Smart Health Check — Staging to Production Configuration Data Promotion Tool
 *
 * MANDATORY SAFETY CONTROLS:
 * 1. Selective promotion ONLY: Master config data (Questionnaires, Services, Packages, Slots).
 * 2. STRICTLY EXCLUDES: Patients, Registrations, Bookings, Holds, Quotes, Invoices,
 *    Users, Sessions, MFA secrets, Passwords, Recovery codes, Audit logs.
 * 3. Never overwrites Production with a full database dump.
 * 4. Prices are NOT published without explicit flag `--promote-approved-prices`.
 * 5. Supports `--dry-run` (default / mandatory first step) and `--apply`.
 * 6. Transactional: All changes run inside a single ACID transaction in `--apply`.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

interface PromotionOptions {
  dryRun: boolean;
  apply: boolean;
  promoteApprovedPrices: boolean;
  includeUatServices: boolean;
}

interface TableProjection {
  table: string;
  sourceCount: number;
  approvedCount: number;
  targetBeforeCount: number;
  toInsert: number;
  toUpdate: number;
  projectedTargetCount: number;
}

function parseArgs(): PromotionOptions {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');
  const promoteApprovedPrices = args.includes('--promote-approved-prices');
  const includeUatServices = args.includes('--include-uat-services');

  if (dryRun === apply) {
    console.error('\n❌ ERROR: You must specify exactly one of --dry-run or --apply\n');
    process.exit(1);
  }

  return { dryRun, apply, promoteApprovedPrices, includeUatServices };
}

function getDatabaseName(urlString: string): string {
  try {
    const u = new URL(urlString);
    return decodeURIComponent(u.pathname.replace(/^\//, ''));
  } catch {
    return 'unknown';
  }
}

async function main() {
  const options = parseArgs();

  const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.STAGING_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

  if (!sourceUrl) {
    console.error('\n❌ ERROR: Missing SOURCE_DATABASE_URL (or STAGING_DATABASE_URL).\n');
    process.exit(1);
  }
  if (!targetUrl) {
    console.error('\n❌ ERROR: Missing TARGET_DATABASE_URL (or DATABASE_URL).\n');
    process.exit(1);
  }

  const sourceDbName = getDatabaseName(sourceUrl);
  const targetDbName = getDatabaseName(targetUrl);

  console.log('======================================================================');
  console.log('🚀 PDH SMART HEALTH CHECK — CONFIGURATION DATA PROMOTION TOOL');
  console.log('======================================================================');
  console.log(`Mode:                     ${options.apply ? '⚡ APPLY (TRANSACTIONAL)' : '🔍 DRY-RUN (READ-ONLY)'}`);
  console.log(`Source Database:          ${sourceDbName}`);
  console.log(`Target Database:          ${targetDbName}`);
  console.log(`Promote Prices Opt-In:    ${options.promoteApprovedPrices ? 'YES' : 'NO (Skipping unapproved pricing)'}`);
  console.log(`Include UAT Mock Items:   ${options.includeUatServices ? 'YES' : 'NO (Excluding mock UAT-* / DEMO-*)'}`);
  console.log('----------------------------------------------------------------------');

  if (sourceUrl === targetUrl || sourceDbName === targetDbName) {
    console.error('\n🛑 SAFETY VIOLATION: Source and Target database URLs resolve to the same database! Aborting.\n');
    process.exit(1);
  }

  if (options.apply && targetDbName === 'pdh_healthcheck_staging') {
    console.error('\n🛑 SAFETY ERROR: Target database is Staging, but this script is for promoting TO Production. Aborting.\n');
    process.exit(1);
  }

  const sourceDb = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
  const targetDb = new PrismaClient({ datasources: { db: { url: targetUrl } } });

  try {
    // 1. DISCOVERY: Verify connectivity
    await sourceDb.$queryRaw`SELECT 1`;
    await targetDb.$queryRaw`SELECT 1`;
    console.log('✔ Connected to Source and Target databases successfully.\n');

    const projections: TableProjection[] = [];

    // --- 1. QUESTIONNAIRE ---
    const allSourceQ = await sourceDb.questionnaire.findMany();
    // Only published/approved questionnaire versions
    const approvedQ = allSourceQ.filter(q => q.status === 'published' || q.approvedBy !== null);
    const targetQ = await targetDb.questionnaire.findMany();
    const targetQVersions = new Set(targetQ.map(q => q.version));
    const qToInsert = approvedQ.filter(q => !targetQVersions.has(q.version));
    const qToUpdate = approvedQ.filter(q => targetQVersions.has(q.version));
    projections.push({
      table: 'Questionnaire',
      sourceCount: allSourceQ.length,
      approvedCount: approvedQ.length,
      targetBeforeCount: targetQ.length,
      toInsert: qToInsert.length,
      toUpdate: qToUpdate.length,
      projectedTargetCount: targetQ.length + qToInsert.length,
    });

    // --- 2. SERVICE ---
    const allSourceServices = await sourceDb.service.findMany();
    const approvedServices = allSourceServices.filter(s => {
      if (options.includeUatServices) return true;
      return !s.code.startsWith('UAT-') && !s.code.startsWith('DEMO-');
    });
    const targetServices = await targetDb.service.findMany();
    const targetServiceCodes = new Set(targetServices.map(s => s.code));
    const sToInsert = approvedServices.filter(s => !targetServiceCodes.has(s.code));
    const sToUpdate = approvedServices.filter(s => targetServiceCodes.has(s.code));
    projections.push({
      table: 'Service',
      sourceCount: allSourceServices.length,
      approvedCount: approvedServices.length,
      targetBeforeCount: targetServices.length,
      toInsert: sToInsert.length,
      toUpdate: sToUpdate.length,
      projectedTargetCount: targetServices.length + sToInsert.length,
    });

    // --- 3. PRICE (Strictly opt-in) ---
    const allSourcePrices = await sourceDb.price.findMany();
    let approvedPrices: typeof allSourcePrices = [];
    let pToInsert: typeof allSourcePrices = [];
    let pToUpdate: typeof allSourcePrices = [];
    const targetPrices = await targetDb.price.findMany();

    if (options.promoteApprovedPrices) {
      const approvedServiceIds = new Set(approvedServices.map(s => s.id));
      approvedPrices = allSourcePrices.filter(p => approvedServiceIds.has(p.serviceId) && p.approvedBy !== null);
      const targetPriceKeys = new Set(targetPrices.map(p => `${p.serviceId}_${p.version}`));
      pToInsert = approvedPrices.filter(p => !targetPriceKeys.has(`${p.serviceId}_${p.version}`));
      pToUpdate = approvedPrices.filter(p => targetPriceKeys.has(`${p.serviceId}_${p.version}`));
    }
    projections.push({
      table: 'Price',
      sourceCount: allSourcePrices.length,
      approvedCount: approvedPrices.length,
      targetBeforeCount: targetPrices.length,
      toInsert: pToInsert.length,
      toUpdate: pToUpdate.length,
      projectedTargetCount: targetPrices.length + pToInsert.length,
    });

    // --- 4. PACKAGE ---
    const allSourcePackages = await sourceDb.package.findMany();
    const approvedPackages = allSourcePackages.filter(p => p.status === 'published');
    const targetPackages = await targetDb.package.findMany();
    const targetPkgKeys = new Set(targetPackages.map(p => `${p.key}_${p.version}`));
    const pkgToInsert = approvedPackages.filter(p => !targetPkgKeys.has(`${p.key}_${p.version}`));
    const pkgToUpdate = approvedPackages.filter(p => targetPkgKeys.has(`${p.key}_${p.version}`));
    projections.push({
      table: 'Package',
      sourceCount: allSourcePackages.length,
      approvedCount: approvedPackages.length,
      targetBeforeCount: targetPackages.length,
      toInsert: pkgToInsert.length,
      toUpdate: pkgToUpdate.length,
      projectedTargetCount: targetPackages.length + pkgToInsert.length,
    });

    // --- 5. PACKAGE ITEM ---
    const approvedPkgIds = new Set(approvedPackages.map(p => p.id));
    const allSourcePkgItems = await sourceDb.packageItem.findMany();
    const approvedPkgItems = allSourcePkgItems.filter(item => approvedPkgIds.has(item.packageId));
    const targetPkgItems = await targetDb.packageItem.findMany();
    const targetItemKeys = new Set(targetPkgItems.map(i => `${i.packageId}_${i.serviceId}`));
    const itemsToInsert = approvedPkgItems.filter(i => !targetItemKeys.has(`${i.packageId}_${i.serviceId}`));
    projections.push({
      table: 'PackageItem',
      sourceCount: allSourcePkgItems.length,
      approvedCount: approvedPkgItems.length,
      targetBeforeCount: targetPkgItems.length,
      toInsert: itemsToInsert.length,
      toUpdate: 0,
      projectedTargetCount: targetPkgItems.length + itemsToInsert.length,
    });

    // --- 6. DAY CAPACITY ---
    const allSourceCapacities = await sourceDb.dayCapacity.findMany();
    // Only non-past day capacities (today or future)
    const todayStr = new Date().toISOString().slice(0, 10);
    const approvedCapacities = allSourceCapacities.filter(c => c.id >= todayStr);
    const targetCapacities = await targetDb.dayCapacity.findMany();
    const targetCapIds = new Set(targetCapacities.map(c => c.id));
    const capToInsert = approvedCapacities.filter(c => !targetCapIds.has(c.id));
    const capToUpdate = approvedCapacities.filter(c => targetCapIds.has(c.id));
    projections.push({
      table: 'DayCapacity',
      sourceCount: allSourceCapacities.length,
      approvedCount: approvedCapacities.length,
      targetBeforeCount: targetCapacities.length,
      toInsert: capToInsert.length,
      toUpdate: capToUpdate.length,
      projectedTargetCount: targetCapacities.length + capToInsert.length,
    });

    // --- 7. SLOT ---
    const approvedCapIds = new Set(approvedCapacities.map(c => c.id));
    const allSourceSlots = await sourceDb.slot.findMany();
    const approvedSlots = allSourceSlots.filter(s => approvedCapIds.has(s.dayId));
    const targetSlots = await targetDb.slot.findMany();
    const targetSlotStarts = new Set(targetSlots.map(s => s.startsAt.toISOString()));
    const slotsToInsert = approvedSlots.filter(s => !targetSlotStarts.has(s.startsAt.toISOString()));
    const slotsToUpdate = approvedSlots.filter(s => targetSlotStarts.has(s.startsAt.toISOString()));
    projections.push({
      table: 'Slot',
      sourceCount: allSourceSlots.length,
      approvedCount: approvedSlots.length,
      targetBeforeCount: targetSlots.length,
      toInsert: slotsToInsert.length,
      toUpdate: slotsToUpdate.length,
      projectedTargetCount: targetSlots.length + slotsToInsert.length,
    });

    // --- 8. BOOKING POLICY ---
    const sourcePolicies = await sourceDb.bookingPolicy.findMany();
    const targetPolicies = await targetDb.bookingPolicy.findMany();
    projections.push({
      table: 'BookingPolicy',
      sourceCount: sourcePolicies.length,
      approvedCount: sourcePolicies.length,
      targetBeforeCount: targetPolicies.length,
      toInsert: sourcePolicies.length > targetPolicies.length ? sourcePolicies.length - targetPolicies.length : 0,
      toUpdate: Math.min(sourcePolicies.length, targetPolicies.length),
      projectedTargetCount: Math.max(sourcePolicies.length, targetPolicies.length),
    });

    // Print Manifest Table
    console.log('📋 DATA PROMOTION MANIFEST PROJECTION:\n');
    console.table(projections);

    // Compute manifest hash
    const manifestJson = JSON.stringify(projections);
    const manifestSha256 = createHash('sha256').update(manifestJson).digest('hex');
    console.log(`Manifest SHA-256: ${manifestSha256}\n`);

    // Explicit confirmation of excluded tables (Zero-data leak check)
    console.log('🛡️ EXCLUSION AUDIT: The following tables are STRICTLY EXCLUDED and will NOT be copied:');
    console.log('   - Patient, Registration, Booking, Hold, Quote, Invoice, FinanceEntry');
    console.log('   - User, Session, Verification, UserInvitation, StaffPasswordReset, MfaRecoveryCode');
    console.log('   - ContactRequest, Waitlist, PrivacyRecord, PrivacyRequest, PrivacyCaseEvent');
    console.log('   - ChatConversation, ChatMessage, ChatAssignment, ChatFeedback, ChatAIUsage\n');

    if (options.dryRun) {
      console.log('✔ DRY-RUN COMPLETE: No changes have been made to Production.');
      console.log('  To apply these changes after operator approval, run with --apply.');
      return;
    }

    // --- APPLY MODE (ATOMIC TRANSACTION) ---
    console.log('⚡ APPLYING PROMOTION TRANSACTIONALLY...');

    await targetDb.$transaction(async (tx) => {
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

      // 3. Prices (if opted in)
      if (options.promoteApprovedPrices && approvedPrices.length > 0) {
        // Resolve target service IDs by code
        const freshTargetServices = await tx.service.findMany();
        const codeToTargetId = new Map(freshTargetServices.map(s => [s.code, s.id]));
        const sourceIdToCode = new Map(approvedServices.map(s => [s.id, s.code]));

        for (const p of approvedPrices) {
          const sCode = sourceIdToCode.get(p.serviceId);
          const targetServiceId = sCode ? codeToTargetId.get(sCode) : null;
          if (targetServiceId) {
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
                approvedBy: p.approvedBy,
                importId: p.importId,
              },
              update: {
                amount: p.amount,
                effectiveFrom: p.effectiveFrom,
                effectiveTo: p.effectiveTo,
                approvedBy: p.approvedBy,
              },
            });
          }
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
      const sourcePkgIdToKey = new Map(approvedPackages.map(p => [p.id, `${p.key}_${p.version}`]));

      const freshTargetServices = await tx.service.findMany();
      const codeToTargetServiceId = new Map(freshTargetServices.map(s => [s.code, s.id]));
      const sourceServiceIdToCode = new Map(approvedServices.map(s => [s.id, s.code]));

      for (const item of approvedPkgItems) {
        const pkgKey = sourcePkgIdToKey.get(item.packageId);
        const targetPkgId = pkgKey ? pkgKeyToTargetId.get(pkgKey) : null;

        const sCode = sourceServiceIdToCode.get(item.serviceId);
        const targetServiceId = sCode ? codeToTargetServiceId.get(sCode) : null;

        if (targetPkgId && targetServiceId) {
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

      // 7. Slots
      // Preserve existing reservations in Production and never reset reservedCapacity below existing bookings
      for (const slot of approvedSlots) {
        const existing = await tx.slot.findUnique({
          where: { startsAt: slot.startsAt },
          include: { _count: { select: { bookings: true, holds: true } } },
        });

        if (existing) {
          const existingBookings = existing._count?.bookings ?? 0;
          const safeCapacity = Math.max(slot.capacity, existingBookings);
          const safeReserved = Math.max(existing.reservedCapacity, existingBookings);
          await tx.slot.update({
            where: { id: existing.id },
            data: {
              capacity: safeCapacity,
              reservedCapacity: safeReserved,
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

      // 8. Booking Policy
      for (const pol of sourcePolicies) {
        await tx.bookingPolicy.upsert({
          where: { id: pol.id },
          create: {
            id: pol.id,
            onlineEnabled: pol.onlineEnabled,
            message: pol.message,
          },
          update: {
            onlineEnabled: pol.onlineEnabled,
            message: pol.message,
          },
        });
      }

      // Record Audit Log Entry in Target Database
      await tx.audit.create({
        data: {
          actorId: 'staging-to-prod-promotion-tool',
          action: 'data.promotion_applied',
          resourceId: 'master-configuration',
          correlationId: `promo-${Date.now()}`,
          metadata: {
            manifestSha256,
            sourceDatabase: sourceDbName,
            targetDatabase: targetDbName,
            promotedTables: projections.map(p => ({
              table: p.table,
              inserted: p.toInsert,
              updated: p.toUpdate,
            })),
          },
        },
      });
    });

    console.log('\n🎉 PROMOTION APPLIED SUCCESSFULLY IN A SINGLE TRANSACTION!');
    console.log(`   Manifest SHA-256: ${manifestSha256}`);
    console.log('   Audit record created in target database.');
  } finally {
    await sourceDb.$disconnect();
    await targetDb.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n❌ FATAL ERROR DURING DATA PROMOTION:', err);
  process.exit(1);
});
