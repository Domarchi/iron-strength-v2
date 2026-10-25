import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// La pila aislada tiene prioridad; las variables ya inyectadas conservan precedencia.
for (const file of [process.env.INTEGRATION_ENV_FILE ?? ".env.e2e.local", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // El helper exige destino aislado incluso si falta el archivo.
  }
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.int.test.ts"],
    // Comparten una única base local y un único coach: nada en paralelo.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
