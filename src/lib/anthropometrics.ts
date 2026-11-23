/** Patient-facing display values only. Never use these to select packages or diagnose. */
export function ageBand35(age: number): "under_35" | "at_least_35" {
  if (!Number.isInteger(age) || age < 0 || age > 130)
    throw new Error("อายุไม่ถูกต้อง");
  return age < 35 ? "under_35" : "at_least_35";
}

/** Height in centimeters, weight in kilograms; BMI in kg/m². */
export function calculateBmi(heightCm: number, weightKg: number): number {
  if (
    !Number.isFinite(heightCm) || !Number.isFinite(weightKg) ||
    heightCm <= 0 || weightKg <= 0
  ) throw new Error("กรุณาระบุส่วนสูงและน้ำหนักเป็นตัวเลขมากกว่า 0");
  return weightKg / (heightCm / 100) ** 2;
}
