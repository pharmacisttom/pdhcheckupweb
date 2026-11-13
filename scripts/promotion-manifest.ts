import { createHash } from "node:crypto";

// Object keys and database row order must not affect an operator's approval.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(JSON.parse(JSON.stringify(value))));
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(
        ([key, item]) => [key, normalize(item)],
      ),
    );
  }
  return value;
}

export function manifestHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function verifyApprovedManifest(
  approvedFile: string,
  checksum: string,
  freshPlan: unknown,
): void {
  const actual = createHash("sha256").update(approvedFile).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(checksum) || actual !== checksum) {
    throw new Error("Approved manifest checksum mismatch; run PREPARE again");
  }
  if (canonicalJson(JSON.parse(approvedFile)) !== canonicalJson(freshPlan)) {
    throw new Error("Source, target or promotion plan changed since PREPARE; approval invalidated");
  }
}
