import { describe, it, expect } from "vitest";
import { extractKnowledge } from "../../src/server/services/chat/import";
import ExcelJS from "exceljs";
import JSZip from "jszip";
describe("bounded chat knowledge import", () => {
  it("extracts UTF8 TXT without executing markup", async () =>
    expect(
      await extractKnowledge(
        new File(["ข้อมูลทั่วไป <script>text</script>"], "faq.txt", {
          type: "text/plain",
        }),
      ),
    ).toContain("ข้อมูลทั่วไป"));
  it("rejects malformed UTF8", async () =>
    await expect(
      extractKnowledge(new File([new Uint8Array([255, 255])], "faq.txt")),
    ).rejects.toThrow());
  it("rejects binary TXT", async () =>
    await expect(
      extractKnowledge(new File(["bad\0text"], "faq.txt")),
    ).rejects.toThrow());
  it("rejects oversized input", async () =>
    await expect(
      extractKnowledge(new File([new Uint8Array(1048577)], "faq.txt")),
    ).rejects.toThrow());
  it("rejects excessive extracted text", async () =>
    await expect(
      extractKnowledge(new File(["x".repeat(12001)], "faq.txt")),
    ).rejects.toThrow());
  it("rejects disguised PDF", async () =>
    await expect(
      extractKnowledge(
        new File(["not pdf"], "faq.pdf", { type: "application/pdf" }),
      ),
    ).rejects.toThrow());
  it(
    "rejects malformed PDF in isolated process",
    async () =>
      await expect(
        extractKnowledge(
          new File(["%PDF-bad"], "faq.pdf", { type: "application/pdf" }),
        ),
      ).rejects.toThrow(),
    10000,
  );
  it("rejects non-DOCX zip", async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet("test");
    const bytes = await book.xlsx.writeBuffer();
    await expect(
      extractKnowledge(new File([new Uint8Array(bytes)], "fake.docx")),
    ).rejects.toThrow();
  }, 10000);
  it("extracts real DOCX text in bounded worker", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.file(
      "_rels/.rels",
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    zip.file(
      "word/document.xml",
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic public FAQ</w:t></w:r></w:p></w:body></w:document>',
    );
    const bytes = await zip.generateAsync({ type: "uint8array" });
    expect(await extractKnowledge(new File([new Uint8Array(bytes)], "faq.docx"))).toContain(
      "Synthetic public FAQ",
    );
  }, 10000);
  it("extracts real PDF text in bounded worker", async () => {
    const content = "BT /F1 12 Tf 40 100 Td (Synthetic public FAQ) Tj ET";
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Length " +
        content.length +
        " >>\nstream\n" +
        content +
        "\nendstream",
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (const [i, obj] of objects.entries()) {
      offsets.push(Buffer.byteLength(pdf));
      pdf += i + 1 + " 0 obj\n" + obj + "\nendobj\n";
    }
    const xref = Buffer.byteLength(pdf);
    pdf +=
      "xref\n0 6\n0000000000 65535 f \n" +
      offsets
        .slice(1)
        .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
        .join("") +
      "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" +
      xref +
      "\n%%EOF";
    expect(
      await extractKnowledge(
        new File([pdf], "faq.pdf", { type: "application/pdf" }),
      ),
    ).toContain("Synthetic public FAQ");
  }, 10000);
});
