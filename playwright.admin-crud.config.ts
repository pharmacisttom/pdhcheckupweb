import base from "./playwright.interest.config";
process.env.PDH_TEST_DIST_DIR = ".next";
process.env.PORT = "3037";
process.env.HOSTNAME = "localhost";
process.env.PDH_TEST_ALLOW_SYNTHETIC_FIXTURES = "true";
process.env.OTP_PROVIDER = "disabled";
process.env.EMAIL_PROVIDER = "disabled";
const config = {
  ...base,
  // The managed server is bound to 3037; never inherit the generic
  // playwright.config.ts baseURL (3036), which triggers the strict CSRF guard.
  use: {
    ...base.use,
    baseURL: "http://localhost:3037",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  testMatch: [
    "admin-crud.spec.ts",
    "rc03-contact.spec.ts",
    "rc03-group.spec.ts",
    "rc03-ui.spec.ts",
    "mobile-app.spec.ts",
    "registration-mobile.spec.ts",
  ],
  timeout: 180000,
  // Run the immutable production bundle; the runner owns and closes its
  // process tree after Playwright has reported the completed test results.
  webServer: {
    ...base.webServer,
    command: "node scripts/start-browser-e2e.mjs",
    reuseExistingServer: process.env.PDH_TEST_E2E_MANAGED_SERVER === "true",
  },
};
export default config;
