import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  assertCsvRowLimit,
  assertSafeXlsx,
} from "../../src/server/services/import-limits";

async function sample() {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Prices").addRow(["service_code", "standard_price"]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
describe("pentest: bounded spreadsheet decompression", () => {
  it("accepts a genuine workbook", async () => {
    const data = await sample();
    expect(() => assertSafeXlsx(data)).not.toThrow();
  });
  it("rejects spoofed declared expansion, bad CRC, truncation and ZIP64 fields", async () => {
    const good = await sample();
    let central = good.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    while (good.readUInt32LE(central + 24) === 0)
      central = good.indexOf(
        Buffer.from([0x50, 0x4b, 0x01, 0x02]),
        central + 4,
      );
    for (const [offset, value] of [
      [24, 0x7fffffff],
      [24, 1],
      [16, 0],
      [20, 0xffffffff],
    ]) {
      const bad = Buffer.from(good);
      bad.writeUInt32LE(value, central + offset);
      expect(() => assertSafeXlsx(bad)).toThrow();
    }
    expect(() => assertSafeXlsx(good.subarray(0, good.length - 10))).toThrow();
  });
  it("rejects compressed actual expansion above the bound using a modest compressed fixture", async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet("Prices").getCell("A1").value = "a".repeat(
      21 * 1024 * 1024,
    );
    const bomb = Buffer.from(await book.xlsx.writeBuffer());
    // Underreport the directory lengths to ensure actual inflation is checked.
    for (let i = 0; i + 46 <= bomb.length; i++)
      if (
        bomb.readUInt32LE(i) === 0x02014b50 &&
        bomb.readUInt32LE(i + 24) > 20 * 1024 * 1024
      )
        bomb.writeUInt32LE(1, i + 24);
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
    expect(() => assertSafeXlsx(bomb)).toThrow();
  });
  it("bounds CSV row allocation before workbook construction and permits quoted newlines", () => {
    expect(() => assertCsvRowLimit(Buffer.from("a\n".repeat(6000)))).toThrow();
    expect(() =>
      assertCsvRowLimit(Buffer.from('a,b\n"first\nsecond",value\n')),
    ).not.toThrow();
  });
});
