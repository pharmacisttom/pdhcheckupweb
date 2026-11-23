/** Shared browser/server identity and Bangkok calendar calculations. No PHI logging. */
export function validThaiId(value: string) {
  if (!/^\d{13}$/.test(value) || /^(\d)\1{12}$/.test(value)) return false;
  const sum = [...value.slice(0, 12)].reduce(
    (total, digit, index) => total + Number(digit) * (13 - index),
    0,
  );
  return (11 - (sum % 11)) % 10 === Number(value[12]);
}

export function ageOn(birthdate: string, at = new Date()) {
  const birth = new Date(birthdate + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(birthdate) ||
    !Number.isFinite(birth.getTime()) ||
    !Number.isFinite(at.getTime()) ||
    birth.toISOString().slice(0, 10) !== birthdate
  )
    throw new Error("วันเกิดไม่ถูกต้อง");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const part = (name: string) =>
    Number(parts.find((p) => p.type === name)?.value);
  const year = part("year"),
    month = part("month"),
    day = part("day");
  const [by, bm, bd] = birthdate.split("-").map(Number);
  let age = year - by;
  if (month < bm || (month === bm && day < bd)) age--;
  if (
    age < 0 ||
    age > 130 ||
    birthdate >
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  )
    throw new Error("วันเกิดไม่ถูกต้อง");
  return age;
}
