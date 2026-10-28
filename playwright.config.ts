import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  // A single dev server compiles routes on demand; concurrent first visits can
  // reload another test's in-progress registration through development HMR.
  workers: 1,
  timeout: 60000,
  expect: { timeout: 20000 },
  use: { baseURL: "http://localhost:3036" },
  webServer: {
    command:
      "node node_modules/next/dist/bin/next dev --turbopack --hostname=localhost --port=3036",
    url: "http://localhost:3036",
    reuseExistingServer: !process.env.CI,
  },
});
