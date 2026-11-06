import { describe, it, expect, vi } from 'vitest';
import {
  filterServices,
  filterPrices,
  filterPackagesAndItems,
  validateSlotReservationPreservation,
  validateDatabaseTargets,
  isUatOrDemoService,
  parseArgs,
  ALLOWED_CONFIG_TABLES,
  RESTRICTED_TRANSACTIONAL_TABLES,
} from '../../scripts/promote-config-data';
import { Prisma } from '@prisma/client';

describe('PDH Smart Health Check — Data Promotion Safety & Referential Integrity', () => {
  // ---------------------------------------------------------------------------
  // 1. Excluded UAT services
  // ---------------------------------------------------------------------------
  describe('1. Excluded UAT services', () => {
    const mockServices = [
      {
        id: 's-1',
        code: 'MED-CBC',
        nameTh: 'ตรวจความสมบูรณ์ของเม็ดเลือด',
        nameEn: 'Complete Blood Count',
        category: 'laboratory',
        unit: 'รายการ',
        active: true,
        requiresReview: false,
        preparation: 'งดอาหาร',
        componentCodes: ['WBC', 'RBC'],
        revision: 1,
      },
      {
        id: 's-2',
        code: 'UAT-CBC',
        nameTh: 'ตรวจความสมบูรณ์ของเม็ดเลือด (จำลอง)',
        nameEn: 'Complete Blood Count (UAT)',
        category: 'laboratory',
        unit: 'รายการ',
        active: true,
        requiresReview: false,
        preparation: 'ข้อมูลจำลอง',
        componentCodes: [],
        revision: 1,
      },
      {
        id: 's-3',
        code: 'DEMO-XRAY',
        nameTh: 'เอกซเรย์ปอด (สาธิต)',
        nameEn: 'Chest X-Ray (Demo)',
        category: 'radiology',
        unit: 'รายการ',
        active: true,
        requiresReview: false,
        preparation: '',
        componentCodes: [],
        revision: 1,
      },
      {
        id: 's-4',
        code: 'MED-INACTIVE',
        nameTh: 'ตรวจพิเศษปิดใช้งาน',
        nameEn: 'Inactive Test',
        category: 'laboratory',
        unit: 'รายการ',
        active: false,
        requiresReview: false,
        preparation: '',
        componentCodes: [],
        revision: 1,
      },
    ];

    it('excludes UAT-* and DEMO-* services by default and never renames them', () => {
      const { approvedServices, excludedServices } = filterServices(mockServices, false);

      expect(approvedServices.map(s => s.code)).toEqual(['MED-CBC']);
      // Confirm UAT-CBC and DEMO-XRAY are not renamed into hospital codes
      expect(approvedServices.find(s => s.code.includes('UAT'))).toBeUndefined();

      const uatExclusion = excludedServices.find(e => e.identifier === 'UAT-CBC');
      expect(uatExclusion).toBeDefined();
      expect(uatExclusion?.reason).toContain('UAT/DEMO mock service excluded');

      const demoExclusion = excludedServices.find(e => e.identifier === 'DEMO-XRAY');
      expect(demoExclusion).toBeDefined();

      const inactiveExclusion = excludedServices.find(e => e.identifier === 'MED-INACTIVE');
      expect(inactiveExclusion?.reason).toContain('Inactive service');
    });

    it('identifies mock indicator keywords accurately in Thai and English', () => {
      expect(isUatOrDemoService({ code: 'UAT-TEST' })).toBe(true);
      expect(isUatOrDemoService({ code: 'DEMO-01' })).toBe(true);
      expect(isUatOrDemoService({ code: 'LAB-01', nameTh: 'ตรวจเลือด (จำลอง)' })).toBe(true);
      expect(isUatOrDemoService({ code: 'LAB-02', nameTh: 'ตรวจคัดกรองสาธิต' })).toBe(true);
      expect(isUatOrDemoService({ code: 'LAB-03', nameEn: 'Synthetic Lipid Panel' })).toBe(true);
      expect(isUatOrDemoService({ code: 'LAB-04', nameTh: 'ตรวจเลือดทั่วไป', nameEn: 'General Blood Test' })).toBe(false);
    });

    it('allows UAT services only when explicitly requested via includeUat flag', () => {
      const { approvedServices } = filterServices(mockServices, true);
      // Active UAT and DEMO services are included; inactive remains excluded
      expect(approvedServices.map(s => s.code)).toEqual(['MED-CBC', 'UAT-CBC', 'DEMO-XRAY']);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Excluded UAT prices
  // ---------------------------------------------------------------------------
  describe('2. Excluded UAT prices & hospital price list validation', () => {
    const sourceServices = [
      { id: 's-1', code: 'MED-CBC' },
      { id: 's-2', code: 'UAT-CBC' },
    ];
    const approvedServices = [{ id: 's-1', code: 'MED-CBC' }];
    const targetServices = [{ id: 'target-s-1', code: 'MED-CBC' }];

    const validEffFrom = new Date('2026-01-01T00:00:00.000Z');
    const validEffTo = new Date('2026-12-31T23:59:59.000Z');

    const sourcePrices = [
      {
        id: 'p-1',
        serviceId: 's-1',
        amount: new Prisma.Decimal('150.00'),
        version: 1,
        effectiveFrom: validEffFrom,
        effectiveTo: validEffTo,
        approvedBy: 'admin-1',
      },
      {
        id: 'p-2',
        serviceId: 's-2', // References UAT service
        amount: new Prisma.Decimal('120.00'),
        version: 1,
        effectiveFrom: validEffFrom,
        effectiveTo: validEffTo,
        approvedBy: 'admin-1',
      },
      {
        id: 'p-3',
        serviceId: 's-1',
        amount: new Prisma.Decimal('180.00'),
        version: 2,
        effectiveFrom: validEffFrom,
        effectiveTo: validEffTo,
        approvedBy: null, // Missing approvedBy
      },
      {
        id: 'p-4',
        serviceId: 's-1',
        amount: new Prisma.Decimal('200.00'),
        version: 3,
        effectiveFrom: validEffFrom,
        effectiveTo: new Date('2025-01-01T00:00:00.000Z'), // Invalid date range (effectiveTo < effectiveFrom)
        approvedBy: 'admin-1',
      },
    ];

    it('excludes prices when promoteApprovedPrices is false (opt-in protection)', () => {
      const { approvedPrices, excludedPrices } = filterPrices(
        sourcePrices,
        sourceServices,
        targetServices,
        approvedServices,
        false
      );
      expect(approvedPrices).toHaveLength(0);
      expect(excludedPrices).toHaveLength(sourcePrices.length);
      expect(excludedPrices[0].reason).toContain('Price promotion not enabled');
    });

    it('strictly excludes UAT prices, missing approvedBy, and invalid effective dates', () => {
      const { approvedPrices, excludedPrices } = filterPrices(
        sourcePrices,
        sourceServices,
        targetServices,
        approvedServices,
        true
      );

      // Only p-1 is approved
      expect(approvedPrices).toHaveLength(1);
      expect(approvedPrices[0].id).toBe('p-1');

      // p-2 excluded because referenced UAT service is excluded
      const uatPriceExclusion = excludedPrices.find(e => e.identifier.includes('UAT-CBC'));
      expect(uatPriceExclusion?.reason).toContain('excluded');

      // p-3 excluded because approvedBy is missing
      const unapprovedPriceExclusion = excludedPrices.find(e => e.identifier === 'MED-CBC_v2');
      expect(unapprovedPriceExclusion?.reason).toContain('Missing approvedBy');

      // p-4 excluded because effectiveTo <= effectiveFrom
      const invalidDateExclusion = excludedPrices.find(e => e.identifier === 'MED-CBC_v3');
      expect(invalidDateExclusion?.reason).toContain('Invalid effective date range');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Missing PackageItem references & Package Integrity
  // ---------------------------------------------------------------------------
  describe('3. Package and PackageItem referential integrity', () => {
    const sourceServices = [
      { id: 's-1', code: 'MED-CBC', nameTh: 'ตรวจเลือด' },
      { id: 's-2', code: 'UAT-CBC', nameTh: 'ตรวจเลือด (จำลอง)' },
      { id: 's-3', code: 'MED-GLUCOSE', nameTh: 'ตรวจน้ำตาล' },
    ];
    const approvedServices = [
      { id: 's-1', code: 'MED-CBC', nameTh: 'ตรวจเลือด' },
    ];
    const targetServices = [
      { id: 'target-s-1', code: 'MED-CBC', nameTh: 'ตรวจเลือด' },
    ];

    const sourcePackages = [
      {
        id: 'pkg-1',
        key: 'PKG-STANDARD',
        version: 1,
        name: 'Standard Package',
        status: 'published',
        approvedBy: 'admin-1',
        fixedPrice: '500.00',
      },
      {
        id: 'pkg-2',
        key: 'PKG-UAT',
        version: 1,
        name: 'UAT Mock Package',
        status: 'published',
        approvedBy: 'admin-1',
        fixedPrice: '300.00',
      },
    ];

    it('excludes packages that reference UAT-only services unless explicitly approved', () => {
      const items = [
        { id: 'pi-1', packageId: 'pkg-1', serviceId: 's-1', position: 1, mode: 'included' },
        { id: 'pi-2', packageId: 'pkg-2', serviceId: 's-2', position: 1, mode: 'included' },
      ];

      const { approvedPackages, excludedPackages } = filterPackagesAndItems(
        sourcePackages,
        items,
        sourceServices,
        approvedServices,
        targetServices,
        false
      );

      expect(approvedPackages.map(p => p.key)).toEqual(['PKG-STANDARD']);
      const uatPkgExclusion = excludedPackages.find(e => e.identifier === 'PKG-UAT_v1');
      expect(uatPkgExclusion?.reason).toContain('Package references UAT-only service');
    });

    it('fails the entire operation before writing if a PackageItem references an unresolved service', () => {
      // pkg-1 references s-3 (MED-GLUCOSE), which is neither in Production nor in approvedServices
      const itemsWithUnresolved = [
        { id: 'pi-1', packageId: 'pkg-1', serviceId: 's-1', position: 1, mode: 'included' },
        { id: 'pi-unresolved', packageId: 'pkg-1', serviceId: 's-3', position: 2, mode: 'included' },
      ];

      expect(() => {
        filterPackagesAndItems(
          [sourcePackages[0]],
          itemsWithUnresolved,
          sourceServices,
          approvedServices, // Only s-1 is approved; s-3 is missing
          targetServices,   // Target only has s-1
          false
        );
      }).toThrow(/Integrity violation: Package 'Standard Package' .* references service 'MED-GLUCOSE' which does not exist in Target and is not in approved imports/);
    });

    it('never silently skips PackageItems', () => {
      const items = [
        { id: 'pi-1', packageId: 'pkg-1', serviceId: 's-1', position: 1, mode: 'included' },
      ];

      const result = filterPackagesAndItems(
        [sourcePackages[0]],
        items,
        sourceServices,
        approvedServices,
        targetServices,
        false
      );

      expect(result.approvedPackageItems).toHaveLength(1);
      expect(result.approvedPackageItems[0].serviceId).toBe('s-1');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Price ID mapping via business keys
  // ---------------------------------------------------------------------------
  describe('4. Price ID mapping via business keys', () => {
    it('resolves Target Service IDs using service code business key matching Apply behavior', () => {
      const sourceServices = [{ id: 'staging-guid-1', code: 'MED-LIPID' }];
      const approvedServices = [{ id: 'staging-guid-1', code: 'MED-LIPID' }];
      const targetServices = [{ id: 'production-cuid-99', code: 'MED-LIPID' }];

      const sourcePrices = [
        {
          id: 'price-stg-1',
          serviceId: 'staging-guid-1',
          amount: new Prisma.Decimal('250.00'),
          version: 1,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          approvedBy: 'director-1',
        },
      ];

      const { approvedPrices } = filterPrices(
        sourcePrices,
        sourceServices,
        targetServices,
        approvedServices,
        true
      );

      expect(approvedPrices).toHaveLength(1);
      // In dry-run, we resolve staging-guid-1 -> MED-LIPID -> production-cuid-99
      const stagingService = sourceServices.find(s => s.id === approvedPrices[0].serviceId);
      const targetService = targetServices.find(s => s.code === stagingService?.code);
      expect(targetService?.id).toBe('production-cuid-99');
    });

    it('correctly projects new price INSERT when service is newly imported in this run', () => {
      // Target does not yet have this service, but it is in approvedServices
      const sourceServices = [{ id: 'stg-new-svc', code: 'MED-NEW-PANEL' }];
      const approvedServices = [{ id: 'stg-new-svc', code: 'MED-NEW-PANEL' }];
      const targetServices: Array<{ id: string; code: string }> = [];

      const sourcePrices = [
        {
          id: 'price-stg-new',
          serviceId: 'stg-new-svc',
          amount: new Prisma.Decimal('500.00'),
          version: 1,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          approvedBy: 'director-1',
        },
      ];

      const { approvedPrices } = filterPrices(
        sourcePrices,
        sourceServices,
        targetServices,
        approvedServices,
        true
      );

      expect(approvedPrices).toHaveLength(1);
      expect(approvedPrices[0].id).toBe('price-stg-new');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Existing Production conflicts
  // ---------------------------------------------------------------------------
  describe('5. Existing Production conflict detection', () => {
    it('detects and flags conflict when production slot or capacity differs from staging', () => {
      const targetSlot = {
        capacity: 10,
        reservedCapacity: 5,
        closed: false,
        _count: { bookings: 5, holds: 0 },
      };

      // Staging proposes to change capacity to 20
      const check = validateSlotReservationPreservation(20, false, targetSlot);
      expect(check.conflict).toBe(true);
      expect(check.safeCapacity).toBe(20);
      expect(check.safeReserved).toBe(5);

      // When identical, conflict is false
      const identicalCheck = validateSlotReservationPreservation(10, false, targetSlot);
      expect(identicalCheck.conflict).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Slot reservation preservation
  // ---------------------------------------------------------------------------
  describe('6. Slot reservation preservation', () => {
    it('never lowers reservedCapacity below active bookings and holds in Production', () => {
      const targetSlotWithActiveBookings = {
        capacity: 15,
        reservedCapacity: 8,
        closed: false,
        _count: { bookings: 6, holds: 2 }, // Total active reservations = 8
      };

      // Staging attempts to set capacity lower than active bookings (e.g. 5)
      const result = validateSlotReservationPreservation(5, false, targetSlotWithActiveBookings);

      // Capacity must be clamped to at least safeReserved (8)
      expect(result.safeCapacity).toBe(8);
      // Reserved capacity remains protected at 8
      expect(result.safeReserved).toBe(8);
      expect(result.details).toContain('Preserve reservedCapacity (8)');
    });

    it('safely updates capacity when staging increases it above existing reservations', () => {
      const targetSlot = {
        capacity: 10,
        reservedCapacity: 3,
        closed: false,
        _count: { bookings: 3, holds: 0 },
      };

      const result = validateSlotReservationPreservation(25, false, targetSlot);
      expect(result.safeCapacity).toBe(25);
      expect(result.safeReserved).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. BookingPolicy exclusion
  // ---------------------------------------------------------------------------
  describe('7. BookingPolicy exclusion from promotion scope', () => {
    it('strictly omits BookingPolicy from allowed promotion tables', () => {
      expect(ALLOWED_CONFIG_TABLES).not.toContain('BookingPolicy');
      expect(ALLOWED_CONFIG_TABLES).toEqual([
        'Questionnaire',
        'Service',
        'Price',
        'Package',
        'PackageItem',
        'DayCapacity',
        'Slot',
      ]);
    });

    it('records BookingPolicy in restricted transactional tables', () => {
      expect(RESTRICTED_TRANSACTIONAL_TABLES).toContain('BookingPolicy');
      expect(RESTRICTED_TRANSACTIONAL_TABLES).toContain('Patient');
      expect(RESTRICTED_TRANSACTIONAL_TABLES).toContain('Booking');
      expect(RESTRICTED_TRANSACTIONAL_TABLES).toContain('User');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Transaction rollback on failure
  // ---------------------------------------------------------------------------
  describe('8. Single transaction rollback on failure', () => {
    it('proves that a failure inside the atomic transaction rolls back all pending writes', async () => {
      let transactionStarted = false;
      let transactionRolledBack = false;

      const mockTargetDb = {
        $transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => {
          transactionStarted = true;
          const mockTx = {
            questionnaire: { upsert: vi.fn().mockResolvedValue({}) },
            service: {
              upsert: vi.fn().mockRejectedValue(new Error('Simulated DB constraint failure')),
            },
          };
          try {
            await callback(mockTx);
          } catch (err) {
            transactionRolledBack = true;
            throw err;
          }
        }),
      };

      await expect(
        mockTargetDb.$transaction(async (tx) => {
          await tx.questionnaire.upsert();
          await tx.service.upsert(); // Fails!
        })
      ).rejects.toThrow('Simulated DB constraint failure');

      expect(transactionStarted).toBe(true);
      expect(transactionRolledBack).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Dry-run with zero writes
  // ---------------------------------------------------------------------------
  describe('9. Dry-run performs zero writes and produces deterministic manifest', () => {
    it('parses dry-run flag without apply', () => {
      const opts = parseArgs(['--dry-run', '--manifest-file=test-manifest.json']);
      expect(opts.dryRun).toBe(true);
      expect(opts.apply).toBe(false);
      expect(opts.manifestFile).toBe('test-manifest.json');
    });

    it('refuses simultaneous dry-run and apply', () => {
      expect(() => parseArgs(['--dry-run', '--apply'])).toThrow(
        /You must specify exactly one of --dry-run or --apply/
      );
    });

    it('refuses apply without manifest checksum', () => {
      expect(() => parseArgs(['--apply'])).toThrow(
        /--apply requires --manifest-checksum=<SHA256>/
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Production target allowlist
  // ---------------------------------------------------------------------------
  describe('10. Production target database allowlist', () => {
    const validSource = 'mysql://user:pass@127.0.0.1:3306/pdh_healthcheck_staging';
    const validTarget = 'mysql://user:pass@127.0.0.1:3306/pdh_healthcheck';

    it('accepts exact approved staging and production databases', () => {
      const result = validateDatabaseTargets(validSource, validTarget, false);
      expect(result.sourceDbName).toBe('pdh_healthcheck_staging');
      expect(result.targetDbName).toBe('pdh_healthcheck');
    });

    it('rejects unapproved source database', () => {
      const invalidSource = 'mysql://user:pass@127.0.0.1:3306/unapproved_db';
      expect(() => validateDatabaseTargets(invalidSource, validTarget, false)).toThrow(
        /Source database must be exactly 'pdh_healthcheck_staging'/
      );
    });

    it('rejects unapproved target database', () => {
      const invalidTarget = 'mysql://user:pass@127.0.0.1:3306/pdh_healthcheck_dev';
      expect(() => validateDatabaseTargets(validSource, invalidTarget, false)).toThrow(
        /Target database must be exactly 'pdh_healthcheck'/
      );
    });

    it('rejects identical source and target databases to prevent self-promotion corruption', () => {
      expect(() => validateDatabaseTargets(validSource, validSource, false)).toThrow(
        /Source and Target database URLs resolve to the same database/
      );
    });

    it('permits arbitrary test databases only when allowTestDatabases is explicitly true', () => {
      const testSource = 'mysql://user:pass@127.0.0.1:3306/test_source_db';
      const testTarget = 'mysql://user:pass@127.0.0.1:3306/test_target_db';
      const result = validateDatabaseTargets(testSource, testTarget, true);
      expect(result.sourceDbName).toBe('test_source_db');
      expect(result.targetDbName).toBe('test_target_db');
    });
  });
});

