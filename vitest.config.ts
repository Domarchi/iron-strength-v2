import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["src/**/*.int.test.ts", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**"],
      exclude: ["src/domain/**/*.test.ts"],
      reporter: ["text"],
      // Puerta de calidad (T57): las reglas de negocio están cubiertas.
      thresholds: { branches: 90, lines: 90, functions: 90, statements: 90 },
    },
  },
});
