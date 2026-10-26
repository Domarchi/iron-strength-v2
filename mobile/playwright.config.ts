import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.MOBILE_E2E_PORT ?? 8082);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("MOBILE_E2E_PORT debe ser un puerto local válido");
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: 0,
  timeout: 90000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "es-CL",
    timezoneId: "America/Santiago",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "webkit", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  webServer: {
    command: `npx expo start --web --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
