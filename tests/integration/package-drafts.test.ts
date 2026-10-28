import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const identity = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => ({ value: identity.token }) }),
}));
import { db } from "../../src/lib/db";
import { encrypt, hash } from "../../src/lib/security";
import { api } from "../../src/server/api";
describe.skipIf(process.env.RUN_DB_TESTS !== "true")(
  "package draft service selection on MySQL",
  () => {
    const marker = crypto.randomUUID();
    let userId: string;
    let serviceId: string;
    let inactiveId: string;
    const packages: string[] = [];
    const input = {
      key: marker,
      name: "Synthetic package",
      description: "Test only",
      audience: "Adults",
      fixedPrice: "1200.00",
      minAge: 18,
      maxAge: 65,
      preparation: "Hospital instructions",
      effectiveFrom: "2026-10-22",
      serviceIds: [] as string[],
    };
    async function post(serviceIds: string[]) {
      const response = await api(
        new Request("http://localhost:3036/api/v1/admin/packages", {
          method: "POST",
          headers: {
            Origin: "http://localhost:3036",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...input, serviceIds }),
        }),
        ["admin", "packages"],
      );
      return { status: response.status, body: await response.json() };
    }
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL!);
      if (
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.pathname !== "/pdh_healthcheck_test"
      )
        throw Error("Isolated test database required");
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("APP_URL", "http://localhost:3036");
      userId = (
        await db.user.create({
          data: {
            email: marker + "@package-test.invalid",
            name: "Package test manager",
            role: "manager",
            passwordHash: "synthetic-not-for-login",
            mfaSecret: encrypt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"),
          },
        })
      ).id;
      identity.token = crypto.randomUUID();
      await db.session.create({
        data: {
          userId,
          tokenHash: hash(identity.token),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      serviceId = (
        await db.service.create({
          data: {
            code: marker + "-active",
            nameTh: "รายการตรวจทดสอบ",
            nameEn: "Synthetic service",
            category: "Test",
            componentCodes: [],
            active: true,
          },
        })
      ).id;
      inactiveId = (
        await db.service.create({
          data: {
            code: marker + "-inactive",
            nameTh: "รายการตรวจปิดใช้งาน",
            nameEn: "Inactive service",
            category: "Test",
            componentCodes: [],
            active: false,
          },
        })
      ).id;
    });
    afterAll(async () => {
      await db.packageItem.deleteMany({
        where: { packageId: { in: packages } },
      });
      await db.package.deleteMany({ where: { id: { in: packages } } });
      await db.audit.deleteMany({ where: { actorId: userId } });
      await db.session.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
      await db.service.deleteMany({
        where: { id: { in: [serviceId, inactiveId] } },
      });
      vi.unstubAllEnvs();
      await db.$disconnect();
    });
    it("rejects zero selected services with a clear Thai message and no saved record", async () => {
      const result = await post([]);
      expect(result.status).toBe(422);
      expect(result.body.error.message).toContain(
        "กรุณาเลือกรายการตรวจอย่างน้อย 1 รายการ",
      );
      expect(await db.package.count({ where: { key: marker } })).toBe(0);
    });
    it("saves the chosen active service in a draft without requiring an individual service price", async () => {
      const response = await api(
        new Request("http://localhost:3036/api/v1/services?q=" + marker),
        ["services"],
      );
      const catalog = (await response.json()).data;
      expect(catalog).toContainEqual(
        expect.objectContaining({ id: serviceId, price: null }),
      );
      const result = await post([serviceId]);
      expect(result.status).toBe(200);
      packages.push(result.body.data.id);
      const saved = await db.package.findUniqueOrThrow({
        where: { id: result.body.data.id },
        include: { items: true },
      });
      expect(saved.status).toBe("draft");
      expect(saved.items.map((item) => item.serviceId)).toEqual([serviceId]);
      expect(saved.fixedPrice.toFixed(2)).toBe("1200.00");
    });
    it("refuses inactive or missing service IDs without creating a partial draft", async () => {
      const before = await db.package.count({ where: { key: marker } });
      for (const id of [inactiveId, "nonexistent-package-service"]) {
        const result = await post([serviceId, id]);
        expect(result.status).toBe(422);
        expect(result.body.error.message).toContain(
          "ไม่มีอยู่หรือปิดใช้งานแล้ว",
        );
      }
      expect(await db.package.count({ where: { key: marker } })).toBe(before);
    });
  },
);
