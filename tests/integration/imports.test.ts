import { describe, it, expect, vi } from 'vitest';
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
import { db } from '../../src/lib/db';
import { approveImport, stageImport } from '../../src/server/services/imports';
const enabled = process.env.RUN_DB_TESTS === 'true';
describe.skipIf(!enabled)('real staged price publication and historical integrity', () => {
  it('rejects self-approval, publishes a new version, and preserves previous price', async () => {
    const code = 'TEST-' + crypto.randomUUID(); const batchIds: string[] = []; let serviceId: string | undefined;
    const csv = (price: string) => 'service_code,service_name_th,service_name_en,category,standard_price,unit,effective_from,effective_to,status\n' + `${code},ทดสอบ,Test,lab,${price},item,2020-01-01,,active\n`;
    try {
      const b1 = await stageImport(new File([csv('123.45')], 'prices.csv'), 'uploader-test', {}); batchIds.push(b1.id);
      expect(b1.status).toBe('staged');
      await expect(approveImport(b1.id, 'uploader-test')).rejects.toThrow();
      await approveImport(b1.id, 'approver-test');
      const svc = await db.service.findUniqueOrThrow({ where: { code } }); serviceId = svc.id;
      const b2 = await stageImport(new File([csv('234.56')], 'prices.csv'), 'uploader-test', {}); batchIds.push(b2.id); await approveImport(b2.id, 'approver-test');
      const prices = await db.price.findMany({ where: { serviceId }, orderBy: { version: 'asc' } });
      expect(prices.map(p => p.amount.toFixed(2))).toEqual(['123.45','234.56']);
      expect(prices.map(p => p.version)).toEqual([1,2]);
      await expect(approveImport(b2.id, 'approver-test')).rejects.toThrow();
    } finally {
      if (serviceId) { await db.price.deleteMany({ where: { serviceId } }); await db.service.delete({ where: { id: serviceId } }); }
      await db.audit.deleteMany({ where: { resourceId: { in: batchIds } } }); await db.importBatch.deleteMany({ where: { id: { in: batchIds } } }); await db.$disconnect();
    }
  });
});
