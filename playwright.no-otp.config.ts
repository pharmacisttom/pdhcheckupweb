import base from "./playwright.interest.config";
process.env.OTP_PROVIDER = "disabled";
const config = { ...base, testMatch: "otp-disabled.spec.ts" };
export default config;
