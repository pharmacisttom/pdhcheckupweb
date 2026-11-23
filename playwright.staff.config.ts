import base from "./playwright.interest.config";
process.env.OTP_PROVIDER = "disabled";
process.env.EMAIL_PROVIDER = "disabled";
process.env.SEED_DEMO = "true";
const config = { ...base, testMatch: "staff-enrollment.spec.ts" };
export default config;
