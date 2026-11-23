import base from "./playwright.interest.config";
process.env.PDH_TEST_DIST_DIR = ".local/next-admin-crud-e2e";
process.env.PDH_TEST_ALLOW_SYNTHETIC_FIXTURES = "true";
process.env.OTP_PROVIDER = "disabled";
process.env.EMAIL_PROVIDER = "disabled";
const config = {
  ...base,
  // The managed server is bound to 3037; never inherit the generic
  // playwright.config.ts baseURL (3036), which triggers the strict CSRF guard.
  use: { ...base.use, baseURL: "http://localhost:3037" },
  testMatch: [
    "admin-crud.spec.ts",
    "rc03-contact.spec.ts",
    "rc03-group.spec.ts",
    "rc03-ui.spec.ts",
    "mobile-app.spec.ts",
    "registration-mobile.spec.ts",
  ],
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
