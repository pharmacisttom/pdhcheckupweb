import base from "./playwright.interest.config";
process.env.PDH_TEST_DIST_DIR=".local/next-admin-crud-e2e";
process.env.SEED_DEMO = "true";
process.env.OTP_PROVIDER = "disabled";
process.env.EMAIL_PROVIDER = "disabled";
const config = {
  ...base,
  testMatch: "admin-crud.spec.ts",
  timeout: 180000,
  // Run the managed E2E server with webpack; the runner owns and closes its
  // process tree after Playwright has reported the completed test results.
  webServer: {
    ...base.webServer,
    command:
      "node node_modules/next/dist/bin/next dev --webpack --hostname=localhost --port=3037",
    reuseExistingServer: process.env.PDH_TEST_E2E_MANAGED_SERVER === "true",
  },
};
export default config;
