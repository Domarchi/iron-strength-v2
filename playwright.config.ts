import { defineConfig, devices } from "@playwright/test";

// La base de pruebas tiene prioridad; .env.local solo completa valores ausentes.
// Las variables ya definidas por CI conservan su precedencia (Node 24).
for (const file of [process.env.E2E_ENV_FILE ?? ".env.e2e.local", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // El archivo es opcional; la validación de fixtures exige una URL local y claves.
  }
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
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  webServer: {
    // Build de producción: es lo que se despliega.
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
