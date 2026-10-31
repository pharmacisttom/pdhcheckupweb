import base from "./playwright.interest.config";
process.env.PDH_TEST_DIST_DIR=".local/next-admin-crud-e2e";
process.env.SEED_DEMO = "true";
process.env.OTP_PROVIDER = "disabled";
process.env.EMAIL_PROVIDER = "disabled";
const config = { ...base, testMatch: "admin-crud.spec.ts", timeout: 180000 };
export default config;
