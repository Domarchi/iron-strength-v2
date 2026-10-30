import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "../../.next-design-test-results",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:8094",
    viewport: { width: 390, height: 844 },
    locale: "es-CL",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "python3 -m http.server 8094 --bind 127.0.0.1 --directory docs/design-refresh",
    cwd: "../..",
    url: "http://127.0.0.1:8094",
    reuseExistingServer: false,
  },
});
