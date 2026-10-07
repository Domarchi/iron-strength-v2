import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Carga .env.local (Node 24) si existe; en CI las variables ya vienen del entorno.
try {
  process.loadEnvFile(".env.local");
} catch {
  // sin .env.local: se usan las variables del entorno
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
