/**
 * PDH Smart Health Check — Dedicated Staging UAT Bootstrap & Seed Script
 * 
 * SAFETY MANDATES:
 * - Staging database ONLY (`pdh_healthcheck_staging` on localhost).
 * - Production database (`pdh_healthcheck`) is STRICTLY PROHIBITED.
 * - Non-destructive: Does not wipe or reset database, preserves tester bookings.
 * - Idempotent: Can be run multiple times safely.
 * - Explicit confirmation required: UAT_STAGING_CONFIRM=pdh_healthcheck_staging SEED_DEMO=true
 * - Supports --dry-run and --apply modes.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Question, RiskRule } from '../src/lib/domain';

const apply = process.argv.includes('--apply');
const dry = process.argv.includes('--dry-run');

if (apply === dry) {
  console.error('\n❌ ERROR: Specify exactly one of --dry-run or --apply\n');
  process.exit(1);
}

// 1. Mandatory Environment Safety Checks
if (process.env.NODE_ENV === 'production') {
  console.error('\n❌ FATAL SAFETY ERROR: NODE_ENV=production is strictly prohibited for UAT seeding!\n');
  process.exit(1);
}

if (process.env.UAT_STAGING_CONFIRM !== 'pdh_healthcheck_staging') {
  console.error('\n❌ FATAL SAFETY ERROR: Missing explicit confirmation: UAT_STAGING_CONFIRM=pdh_healthcheck_staging\n');
  process.exit(1);
}

if (process.env.SEED_DEMO !== 'true') {
  console.error('\n❌ FATAL SAFETY ERROR: SEED_DEMO=true is required to execute UAT seeding.\n');
  process.exit(1);
}

const urlString = process.env.DATABASE_URL;
if (!urlString) {
  console.error('\n❌ ERROR: DATABASE_URL environment variable is missing.\n');
  process.exit(1);
}

let url: URL;
try {
  url = new URL(urlString);
} catch {
  console.error('\n❌ ERROR: DATABASE_URL is not a valid URL.\n');
  process.exit(1);
}

const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
const isLocalhost = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
const isMysql = url.protocol === 'mysql:' || url.protocol === 'mysqls:';

// CRITICAL DB TARGET ISOLATION CHECK
if (!isMysql || !isLocalhost || dbName !== 'pdh_healthcheck_staging') {
  console.error('\n🛑 CRITICAL SAFETY VIOLATION: Database target is NOT approved staging MySQL on localhost!');
  console.error(`   Target host: ${url.hostname}`);
  console.error(`   Target DB:   ${dbName}`);
  console.error('   Expected DB: pdh_healthcheck_staging on 127.0.0.1');
  console.error('   Aborting immediately to protect Production.\n');
  process.exit(1);
}

// Verify Staging Backup file if provided
const backup = process.env.UAT_BACKUP_FILE || '';
if (backup) {
  if (!backup.endsWith('.sql') || !existsSync(backup)) {
    console.error(`\n❌ ERROR: Specified backup file not found or invalid: ${backup}\n`);
    process.exit(1);
  }
  if (readFileSync(backup).byteLength < 1000) {
    console.error('\n❌ ERROR: Backup file appears corrupt or smaller than 1KB.\n');
    process.exit(1);
  }
}

const db = new PrismaClient();

// 2. Clinically Plausible Synthetic Services & Prices (Master Prompt Section 4)
interface UatServiceDef {
  code: string;
  nameTh: string;
  nameEn: string;
  category: string;
  amount: string;
  preparation: string;
}

const UAT_SERVICES: UatServiceDef[] = [
  {
    code: 'UAT-CBC',
    nameTh: 'ตรวจความสมบูรณ์ของเม็ดเลือด (จำลอง)',
    nameEn: 'Complete Blood Count (UAT)',
    category: 'laboratory',
    amount: '120.00',
    preparation: 'งดน้ำและอาหาร 8-10 ชม. ก่อนตรวจ (ข้อมูลจำลองสำหรับการทดสอบ)',
  },
  {
    code: 'UAT-FBS',
    nameTh: 'ตรวจระดับน้ำตาลในเลือด (จำลอง)',
    nameEn: 'Fasting Blood Sugar (UAT)',
    category: 'laboratory',
    amount: '80.00',
    preparation: 'งดอาหารและเครื่องดื่มอย่างน้อย 8 ชั่วโมงก่อนตรวจ (ข้อมูลจำลองสำหรับการทดสอบ)',
  },
  {
    code: 'UAT-LIPID',
    nameTh: 'ตรวจระดับไขมันในเลือดครบชุด (จำลอง)',
    nameEn: 'Lipid Profile Panel (UAT)',
    category: 'laboratory',
    amount: '250.00',
    preparation: 'งดอาหารและเครื่องดื่ม 10-12 ชั่วโมงก่อนตรวจ (ข้อมูลจำลองสำหรับการทดสอบ)',
  },
  {
    code: 'UAT-RENAL',
    nameTh: 'ตรวจการทำงานของไต BUN/Creatinine (จำลอง)',
    nameEn: 'Renal Function Test BUN/Creatinine (UAT)',
    category: 'laboratory',
    amount: '150.00',
    preparation: 'ดื่มน้ำสะอาดตามปกติ (ข้อมูลจำลองสำหรับการทดสอบ)',
  },
  {
    code: 'UAT-LIVER',
    nameTh: 'ตรวจการทำงานของตับ SGOT/SGPT/ALP (จำลอง)',
    nameEn: 'Liver Function Test SGOT/SGPT/ALP (UAT)',
    category: 'laboratory',
    amount: '200.00',
    preparation: 'งดเครื่องดื่มแอลกอฮอล์อย่างน้อย 24 ชั่วโมงก่อนตรวจ (ข้อมูลจำลองสำหรับการทดสอบ)',
  },
  {
    code: 'UAT-UA',
    nameTh: 'ตรวจปัสสาวะสมบูรณ์แบบ (จำลอง)',
    nameEn: 'Complete Urinalysis (UAT)',
    category: 'laboratory',
    amount: '80.00',
    preparation: 'เก็บปัสสาวะช่วงกลางลำ (ข้อมูลจำลองสำหรับการทดสอบ)',
  },
];

// 3. Synthetic Packages (Master Prompt Section 4)
interface UatPackageDef {
  key: string;
  name: string;
  description: string;
  audience: string;
  fixedPrice: string;
  minAge: number;
  maxAge: number;
  preparation: string;
  includedCodes: string[];
}

const UAT_PACKAGES: UatPackageDef[] = [
  {
    key: 'UAT-BASIC',
    name: '[UAT] แพ็กเกจตรวจสุขภาพพื้นฐาน (จำลอง)',
    description: 'แพ็กเกจข้อมูลสังเคราะห์สำหรับทดสอบ UAT ตรวจความสมบูรณ์ของเม็ดเลือด น้ำตาลในเลือด และปัสสาวะ (CBC, FBS, UA)',
    audience: 'ผู้ทดสอบระบบ UAT ทุกกลุ่มอายุ',
    fixedPrice: '250.00',
    minAge: 15,
    maxAge: 120,
    preparation: 'งดน้ำและอาหารอย่างน้อย 8-10 ชั่วโมงก่อนตรวจ (ข้อมูลจำลองสำหรับการทดสอบเท่านั้น ไม่ใช่ราคาจริง)',
    includedCodes: ['UAT-CBC', 'UAT-FBS', 'UAT-UA'],
  },
  {
    key: 'UAT-PLUS',
    name: '[UAT] แพ็กเกจตรวจสุขภาพครอบคลุม (จำลอง)',
    description: 'แพ็กเกจข้อมูลสังเคราะห์สำหรับทดสอบ UAT ครอบคลุมตรวจเลือด น้ำตาล ไขมัน ไต ตับ และปัสสาวะ (CBC, FBS, LIPID, RENAL, LIVER, UA)',
    audience: 'ผู้ทดสอบระบบ UAT ทุกกลุ่มอายุ',
    fixedPrice: '750.00',
    minAge: 15,
    maxAge: 120,
    preparation: 'งดน้ำและอาหารอย่างน้อย 10-12 ชั่วโมงก่อนตรวจ (ข้อมูลจำลองสำหรับการทดสอบเท่านั้น ไม่ใช่ราคาจริง)',
    includedCodes: ['UAT-CBC', 'UAT-FBS', 'UAT-LIPID', 'UAT-RENAL', 'UAT-LIVER', 'UAT-UA'],
  },
];

// 4. Clinical Questionnaire covering all 10 required domains (Master Prompt Section 4)
const UAT_QUESTIONS: Question[] = [
  // 1. Chronic diseases
  {
    id: 'diabetes',
    label: 'เคยได้รับการวินิจฉัยโรคเบาหวานหรือไม่',
    type: 'single',
    options: ['ไม่เคย', 'เคย', 'ไม่ทราบ'],
    required: true,
  },
  {
    id: 'hypertension',
    label: 'เคยได้รับการวินิจฉัยโรคความดันโลหิตสูงหรือไม่',
    type: 'single',
    options: ['ไม่เคย', 'เคย', 'ไม่ทราบ'],
    required: true,
  },
  {
    id: 'dyslipidemia',
    label: 'เคยได้รับการวินิจฉัยโรคไขมันในเลือดสูงหรือไม่',
    type: 'single',
    options: ['ไม่เคย', 'เคย', 'ไม่ทราบ'],
    required: true,
  },
  {
    id: 'kidney',
    label: 'เคยได้รับการวินิจฉัยโรคไตเรื้อรังหรือไม่',
    type: 'single',
    options: ['ไม่เคย', 'เคย', 'ไม่ทราบ'],
    required: true,
  },
  {
    id: 'heart',
    label: 'เคยได้รับการวินิจฉัยโรคหัวใจและหลอดเลือดหรือไม่',
    type: 'single',
    options: ['ไม่เคย', 'เคย', 'ไม่ทราบ'],
    required: true,
  },
  {
    id: 'liver',
    label: 'เคยได้รับการวินิจฉัยโรคตับหรือไม่',
    type: 'single',
    options: ['ไม่เคย', 'เคย', 'ไม่ทราบ'],
    required: true,
  },
  // 2. Family history
  {
    id: 'family',
    label: 'ประวัติโรคไม่ติดต่อเรื้อรัง (NCDs) ในญาติสายตรง (พ่อ แม่ พี่ น้อง)',
    type: 'multiple',
    options: ['เบาหวาน', 'ความดันโลหิตสูง', 'โรคหัวใจ', 'โรคหลอดเลือดสมอง', 'มะเร็ง', 'ไม่มี', 'ไม่ทราบ'],
    required: false,
  },
  // 3. Smoking
  {
    id: 'smoking',
    label: 'พฤติกรรมการสูบบุหรี่',
    type: 'single',
    options: ['ไม่สูบ', 'เคยสูบแต่เลิกแล้ว', 'สูบเป็นประจำ', 'ไม่ประสงค์ตอบ'],
    required: true,
  },
  // 4. Alcohol consumption
  {
    id: 'alcohol',
    label: 'พฤติกรรมการดื่มเครื่องดื่มแอลกอฮอล์',
    type: 'single',
    options: ['ไม่ดื่ม', 'ดื่มบางครั้ง/เข้าสังคม', 'ดื่มเป็นประจำ', 'ไม่ประสงค์ตอบ'],
    required: true,
  },
  // 5. Weight and height
  {
    id: 'weight',
    label: 'น้ำหนัก (กก.)',
    type: 'numeric',
    min: 1,
    max: 400,
    required: true,
  },
  {
    id: 'height',
    label: 'ส่วนสูง (ซม.)',
    type: 'numeric',
    min: 30,
    max: 250,
    required: true,
  },
  // 6. Medication history
  {
    id: 'medication',
    label: 'มียาหรืออาหารเสริมที่รับประทานเป็นประจำหรือไม่',
    type: 'single',
    options: ['ไม่มี', 'มี', 'ไม่ทราบ'],
    required: true,
  },
  {
    id: 'medication_details',
    label: 'ระบุยาหรืออาหารเสริมที่รับประทานประจำ',
    type: 'text',
    required: true,
    showIf: { field: 'medication', equals: 'มี' },
  },
  // 7. Drug allergy
  {
    id: 'allergy',
    label: 'ประวัติการแพ้ยาหรือสารเคมี (ถ้ามี)',
    type: 'text',
    required: false,
  },
  // 8. Occupational exposure
  {
    id: 'exposure',
    label: 'ความเสี่ยงหรือสารเคมีจากการทำงาน (ถ้ามี)',
    type: 'text',
    required: false,
  },
  // 9. Pregnancy
  {
    id: 'pregnancy',
    label: 'การตั้งครรภ์หรือสงสัยว่าตั้งครรภ์ (กรณีสตรี)',
    type: 'single',
    options: ['ไม่เกี่ยวข้อง', 'ไม่ใช่', 'ใช่', 'ไม่ทราบ'],
    required: false,
  },
  // 10. Symptoms requiring clinical review
  {
    id: 'symptoms',
    label: 'มีอาการผิดปกติ (เช่น เจ็บหน้าอก หอบเหนื่อย หรือน้ำหนักลดผิดปกติ) ที่ต้องการให้เจ้าหน้าที่ประเมินหรือไม่',
    type: 'single',
    options: ['ไม่มี', 'มี'],
    required: true,
  },
];

// Preserved clinical risk rules
const UAT_RULES: RiskRule[] = [
  {
    id: 'uat-symptoms-review',
    field: 'symptoms',
    equals: 'มี',
    decision: 'needs_clinical_review',
    reason: '[UAT] ผู้รับบริการระบุอาการผิดปกติ ต้องได้รับการประเมินโดยบุคลากรทางการแพทย์ก่อนตรวจ',
  },
  {
    id: 'uat-pregnancy-review',
    field: 'pregnancy',
    equals: 'ใช่',
    decision: 'needs_clinical_review',
    reason: '[UAT] สตรีมีครรภ์ต้องได้รับการประเมินความเหมาะสมและความปลอดภัยของรายการตรวจ',
  },
];

const effectiveFrom = new Date('2020-01-01T00:00:00.000Z');

function formatBangkokDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function main() {
  console.log('\n===============================================================');
  console.log('   PDH SMART HEALTH CHECK — STAGING UAT SEED & BOOTSTRAP       ');
  console.log('===============================================================');
  console.log(`Mode:            ${apply ? '🚀 APPLY (Live Transactional Write)' : '🔍 DRY-RUN (Read-Only Simulation)'}`);
  console.log(`Target Database: ${dbName} @ ${url.hostname}`);
  console.log(`Timestamp:       ${new Date().toISOString()}`);
  console.log('---------------------------------------------------------------\n');

  // Preflight: Verify active superadmin
  const admin = await db.user.findFirst({
    where: { role: 'superadmin', active: true },
    select: { id: true, email: true, name: true },
  });

  if (!admin) {
    throw new Error('STOP: No active superadmin account found in staging database. Create or activate one first.');
  }

  console.log(`[AUTH] Approving Superadmin: ${admin.name} (${admin.email}) [${admin.id}]`);

  // Inspect existing records for idempotency summary
  const [
    serviceCount,
    priceCount,
    packageCount,
    packageItemCount,
    questionnaireCount,
    dayCount,
    slotCount,
    bookingCount,
  ] = await Promise.all([
    db.service.count(),
    db.price.count(),
    db.package.count(),
    db.packageItem.count(),
    db.questionnaire.count(),
    db.dayCapacity.count(),
    db.slot.count(),
    db.booking.count(),
  ]);

  console.log('\n[PREFLIGHT] Current Database State:');
  console.log(`  - Services:      ${serviceCount}`);
  console.log(`  - Prices:        ${priceCount}`);
  console.log(`  - Packages:      ${packageCount}`);
  console.log(`  - Package Items: ${packageItemCount}`);
  console.log(`  - Questionnaires:${questionnaireCount}`);
  console.log(`  - Day Capacities:${dayCount}`);
  console.log(`  - Booking Slots: ${slotCount}`);
  console.log(`  - Bookings:      ${bookingCount} (Preserved - NEVER modified by seed)`);

  // Check if a published questionnaire already exists
  const existingPublishedQ = await db.questionnaire.findFirst({
    where: { status: 'published', approvedBy: { not: null } },
    orderBy: { version: 'desc' },
  });

  if (existingPublishedQ) {
    console.log(`\n[QUESTIONNAIRE] Published questionnaire found: Version ${existingPublishedQ.version} (Preserving existing questionnaire)`);
  } else {
    console.log('\n[QUESTIONNAIRE] No published questionnaire found. Plan: Create and publish UAT Questionnaire v1.');
  }

  // Plan 14 days of appointment slots (Asia/Bangkok, starts 2 days out to satisfy >24hr rule)
  const now = new Date();
  const plannedDays: { dayId: string; hours: string[] }[] = [];
  for (let i = 2; i <= 15; i++) {
    const targetDate = new Date(now.getTime() + i * 86400000);
    const dayId = formatBangkokDate(targetDate);
    plannedDays.push({
      dayId,
      hours: ['08', '09', '10', '13'],
    });
  }

  console.log(`\n[PLAN] Appointment Availability Plan:`);
  console.log(`  - Schedule window: 14 days (${plannedDays[0].dayId} to ${plannedDays[plannedDays.length - 1].dayId})`);
  console.log(`  - Slots per day:   4 slots (08:00, 09:00, 10:00, 13:00 Asia/Bangkok)`);
  console.log(`  - Total slots:     ${plannedDays.length * 4} slots planned (Capacity: 5 per slot, Day capacity: 20)`);

  console.log('\n[PLAN] UAT Catalog Plan:');
  console.log(`  - Services: ${UAT_SERVICES.map(s => `${s.code} (${s.amount}฿)`).join(', ')}`);
  console.log(`  - Packages: ${UAT_PACKAGES.map(p => `${p.key} (${p.fixedPrice}฿)`).join(', ')}`);

  if (dry) {
    console.log('\n===============================================================');
    console.log('✅ DRY-RUN COMPLETE: Staging database verification successful.');
    console.log('   All checks passed. No changes were committed.');
    console.log('   To apply changes, run with: --apply');
    console.log('===============================================================\n');
    return;
  }

  // Live Apply Mode — Atomic Transaction
  console.log('\n[APPLY] Committing changes via Prisma transaction...');

  await db.$transaction(async (tx) => {
    // 1. Ensure BookingPolicy is online and operational
    await tx.bookingPolicy.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        onlineEnabled: true,
        message: 'เปิดรับการจองคิวตรวจสุขภาพออนไลน์ตามปกติ (UAT Staging)',
      },
      update: {
        onlineEnabled: true,
        message: 'เปิดรับการจองคิวตรวจสุขภาพออนไลน์ตามปกติ (UAT Staging)',
      },
    });

    // 2. Ensure Published Questionnaire
    if (!existingPublishedQ) {
      await tx.questionnaire.upsert({
        where: { version: 1 },
        create: {
          version: 1,
          questions: UAT_QUESTIONS as unknown as Prisma.InputJsonValue,
          rules: UAT_RULES as unknown as Prisma.InputJsonValue,
          status: 'published',
          approvedBy: admin.id,
        },
        update: {
          questions: UAT_QUESTIONS as unknown as Prisma.InputJsonValue,
          rules: UAT_RULES as unknown as Prisma.InputJsonValue,
          status: 'published',
          approvedBy: admin.id,
        },
      });
      console.log('  ✔ Created & published UAT Questionnaire v1');
    }

    // 3. Upsert Services and Prices
    const serviceMap = new Map<string, string>();
    for (const s of UAT_SERVICES) {
      const serviceRecord = await tx.service.upsert({
        where: { code: s.code },
        create: {
          code: s.code,
          nameTh: s.nameTh,
          nameEn: s.nameEn,
          category: s.category,
          unit: 'รายการ',
          active: true,
          requiresReview: false,
          preparation: s.preparation,
          componentCodes: [],
        },
        update: {
          nameTh: s.nameTh,
          nameEn: s.nameEn,
          category: s.category,
          active: true,
          preparation: s.preparation,
        },
      });

      serviceMap.set(s.code, serviceRecord.id);

      await tx.price.upsert({
        where: {
          serviceId_version: {
            serviceId: serviceRecord.id,
            version: 1,
          },
        },
        create: {
          serviceId: serviceRecord.id,
          amount: new Prisma.Decimal(s.amount),
          effectiveFrom,
          version: 1,
          approvedBy: admin.id,
        },
        update: {
          amount: new Prisma.Decimal(s.amount),
          effectiveFrom,
        },
      });
    }
    console.log(`  ✔ Upserted ${UAT_SERVICES.length} synthetic health services & prices`);

    // 4. Upsert Packages and Package Items
    for (const pkg of UAT_PACKAGES) {
      const packageRecord = await tx.package.upsert({
        where: {
          key_version: {
            key: pkg.key,
            version: 1,
          },
        },
        create: {
          key: pkg.key,
          version: 1,
          name: pkg.name,
          description: pkg.description,
          audience: pkg.audience,
          fixedPrice: new Prisma.Decimal(pkg.fixedPrice),
          minAge: pkg.minAge,
          maxAge: pkg.maxAge,
          preparation: pkg.preparation,
          status: 'published',
          effectiveFrom,
          approvedBy: admin.id,
        },
        update: {
          name: pkg.name,
          description: pkg.description,
          audience: pkg.audience,
          fixedPrice: new Prisma.Decimal(pkg.fixedPrice),
          status: 'published',
          effectiveFrom,
        },
      });

      // Synchronize Package Items
      for (let pos = 0; pos < pkg.includedCodes.length; pos++) {
        const serviceCode = pkg.includedCodes[pos];
        const serviceId = serviceMap.get(serviceCode);
        if (serviceId) {
          await tx.packageItem.upsert({
            where: {
              packageId_serviceId: {
                packageId: packageRecord.id,
                serviceId,
              },
            },
            create: {
              packageId: packageRecord.id,
              serviceId,
              position: pos,
              mode: 'included',
            },
            update: {
              position: pos,
              mode: 'included',
            },
          });
        }
      }
    }
    console.log(`  ✔ Upserted ${UAT_PACKAGES.length} synthetic packages and item mappings`);

    // 5. Upsert Day Capacities and Booking Slots (Non-destructive to existing bookings)
    let createdSlots = 0;
    for (const plan of plannedDays) {
      await tx.dayCapacity.upsert({
        where: { id: plan.dayId },
        create: {
          id: plan.dayId,
          capacity: 20,
          blackout: false,
        },
        update: {},
      });

      for (const hour of plan.hours) {
        const startsAt = new Date(`${plan.dayId}T${hour}:00:00+07:00`);
        const endsAt = new Date(startsAt.getTime() + 3600000);

        const existingSlot = await tx.slot.findUnique({
          where: { startsAt },
        });

        if (!existingSlot) {
          await tx.slot.create({
            data: {
              dayId: plan.dayId,
              startsAt,
              endsAt,
              capacity: 5,
              reservedCapacity: 0,
              closed: false,
            },
          });
          createdSlots++;
        }
      }
    }
    console.log(`  ✔ Verified 14-day schedule (${createdSlots} new slots created, existing slots preserved)`);

    // 6. Audit Log Entry
    const correlationId = createHash('sha256')
      .update(`${Date.now()}-${admin.id}-${backup}`)
      .digest('hex')
      .slice(0, 32);

    await tx.audit.create({
      data: {
        actorId: admin.id,
        action: 'UAT_STAGING_SEED',
        resourceId: 'UAT-BOOTSTRAP-V2',
        correlationId,
        metadata: {
          mode: 'staging',
          servicesCount: UAT_SERVICES.length,
          packagesCount: UAT_PACKAGES.length,
          daysScheduled: plannedDays.length,
          appliedAt: new Date().toISOString(),
          backupBasename: backup ? backup.split('/').pop() : 'none',
        },
      },
    });
    console.log(`  ✔ Audit record created: Correlation ID [${correlationId}]`);
  }, { timeout: 45000 });

  console.log('\n===============================================================');
  console.log('🎉 SUCCESS: UAT staging seed committed successfully!');
  console.log('   - Questionnaire: Available & published (no 503 error)');
  console.log('   - Catalog:       Services & packages live');
  console.log('   - Availability:  Slots open for the next 14 days');
  console.log('   - Production:    COMPLETELY UNTOUCHED & ISOLATED');
  console.log('===============================================================\n');
}

main()
  .catch((e) => {
    console.error('\n❌ EXECUTION FAILED:', e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
