import { crc32, inflateRawSync } from "node:zlib";
import { AppError } from "@/lib/security";

const MAX_EXPANDED = 20 * 1024 * 1024;
const invalid = () =>
  new AppError(422, "ไฟล์ XLSX ไม่ถูกต้องหรือมีขนาดขยายเกินกำหนด");

// Check the ZIP directory structurally, then bound actual inflation. Declared
// ZIP lengths alone do not stop a file whose metadata underreports expansion.
export function assertSafeXlsx(data: Buffer) {
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (
      data.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + data.readUInt16LE(i + 20) === data.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0 || data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6))
    throw invalid();
  const count = data.readUInt16LE(end + 10);
  const directorySize = data.readUInt32LE(end + 12);
  const directoryOffset = data.readUInt32LE(end + 16);
  if (
    !count ||
    count > 1000 ||
    data.readUInt16LE(end + 8) !== count ||
    directoryOffset + directorySize !== end
  )
    throw invalid();
  let position = directoryOffset;
  let expanded = 0;
  const names = new Set<string>();
  const ranges: [number, number][] = [];
  try {
    for (let index = 0; index < count; index++) {
      if (position + 46 > end || data.readUInt32LE(position) !== 0x02014b50)
        throw invalid();
      const flags = data.readUInt16LE(position + 8);
      const method = data.readUInt16LE(position + 10);
      const checksum = data.readUInt32LE(position + 16);
      const compressed = data.readUInt32LE(position + 20);
      const declared = data.readUInt32LE(position + 24);
      const nameLength = data.readUInt16LE(position + 28);
      const extraLength = data.readUInt16LE(position + 30);
      const commentLength = data.readUInt16LE(position + 32);
      const local = data.readUInt32LE(position + 42);
      const next = position + 46 + nameLength + extraLength + commentLength;
      if (
        next > end ||
        flags & 1 ||
        ![0, 8].includes(method) ||
        declared > MAX_EXPANDED - expanded ||
        compressed === 0xffffffff ||
        local === 0xffffffff ||
        data.readUInt16LE(position + 34)
      )
        throw invalid();
      const name = data
        .subarray(position + 46, position + 46 + nameLength)
        .toString("utf8");
      if (
        !name ||
        names.has(name) ||
        name.startsWith("/") ||
        name.includes("\\") ||
        name.split("/").includes("..") ||
        /(?:vbaProject\.bin|externalLinks\/|embeddings\/)/i.test(name)
      )
        throw invalid();
      names.add(name);
      if (
        local + 30 > directoryOffset ||
        data.readUInt32LE(local) !== 0x04034b50 ||
        data.readUInt16LE(local + 6) !== flags ||
        data.readUInt16LE(local + 8) !== method
      )
        throw invalid();
      const localNameLength = data.readUInt16LE(local + 26);
      const start =
        local + 30 + localNameLength + data.readUInt16LE(local + 28);
      if (
        start + compressed > directoryOffset ||
        data
          .subarray(local + 30, local + 30 + localNameLength)
          .toString("utf8") !== name
      )
        throw invalid();
      if (ranges.some(([a, b]) => local < b && start + compressed > a))
        throw invalid();
      ranges.push([local, start + compressed]);
      const bytes = data.subarray(start, start + compressed);
      const actual =
        method === 0
          ? bytes
          : inflateRawSync(bytes, {
              maxOutputLength: Math.max(1, MAX_EXPANDED - expanded),
            });
      expanded += actual.length;
      if (
        expanded > MAX_EXPANDED ||
        actual.length !== declared ||
        crc32(actual) !== checksum
      )
        throw invalid();
      position = next;
    }
    if (
      position !== end ||
      !names.has("[Content_Types].xml") ||
      !names.has("xl/workbook.xml")
    )
      throw invalid();
  } catch {
    throw invalid();
  }
}

export function assertCsvRowLimit(data: Buffer) {
  const text = data.toString("utf8");
  let quoted = false;
  let rows = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (text[i] === "\n" && !quoted && ++rows > 5002) {
      throw new AppError(422, "จำกัดไม่เกิน 5,000 แถวต่อไฟล์");
    }
  }
}
