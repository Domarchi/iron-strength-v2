import { defineConfig, devices } from "@playwright/test";

// Carga .env.local (Node 24) si existe; en CI las variables ya vienen del entorno.
try {
  process.loadEnvFile(".env.local");
} catch {
  // sin .env.local: se usan las variables del entorno
}

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  // Comparten una única base local y un único coach: nada en paralelo.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "es-CL",
    timezoneId: "America/Santiago",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Pixel 7"],
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    // Build de producción: es lo que se despliega.
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
