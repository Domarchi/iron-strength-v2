import { createClient as uncheckedClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { admin as e2eAdmin, resetAll } from "../../../e2e/support/db";
import { adminClient, anonClient, resetUsers } from "../../test/int/helpers";

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn<(url: string, key: string, options: unknown) => object>(() => ({})),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
beforeEach(() => {
  vi.stubEnv("CI", "");
  vi.stubEnv("GITHUB_ACTIONS", "");
  vi.stubEnv("RUNNER_ENVIRONMENT", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "synthetic-secret");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic-public");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

for (const [name, factory] of [
  ["E2E", e2eAdmin],
  ["integración admin", adminClient],
  ["integración anónimo", anonClient],
] as const) {
  describe(name, () => {
    it.each([
      "http://127.0.0.1:54321",
      "http://localhost:54321",
      "http://localhost:55321",
      "http://127.0.0.1:55321/other",
      "http://user:password@127.0.0.1:55321",
      "https://remote.supabase.co",
      "not-a-url",
    ])("rechaza %s antes de crear un cliente", (url) => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
      expect(() => factory()).toThrow();
      expect(createClient).not.toHaveBeenCalled();
    });
    it("permite la instancia aislada de este equipo", () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
      expect(() => factory()).not.toThrow();
      expect(createClient).toHaveBeenCalledOnce();
      expect(createClient.mock.calls[0][0]).toBe("http://127.0.0.1:55321");
    });
    it("CI=true o un runner propio no autorizan la base interactiva", () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
      vi.stubEnv("CI", "true");
      expect(() => factory()).toThrow();
      vi.stubEnv("GITHUB_ACTIONS", "true");
      vi.stubEnv("RUNNER_ENVIRONMENT", "self-hosted");
      expect(() => factory()).toThrow();
      expect(createClient).not.toHaveBeenCalled();
    });
    it("permite la pila efímera del runner alojado por GitHub", () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
      vi.stubEnv("CI", "true");
      vi.stubEnv("GITHUB_ACTIONS", "true");
      vi.stubEnv("RUNNER_ENVIRONMENT", "github-hosted");
      expect(() => factory()).not.toThrow();
      expect(createClient).toHaveBeenCalledOnce();
    });
  });
}

it("una limpieza con cliente ya creado vuelve a exigir el destino aislado", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  const integration = adminClient();
  const e2e = e2eAdmin();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  await expect(resetUsers(integration)).rejects.toThrow("instancia aislada");
  await expect(resetAll(e2e)).rejects.toThrow("instancia aislada");
});

it("no permite limpiar con un cliente ajeno aunque el entorno diga 55321", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  const outside = uncheckedClient<Database>("https://remote.supabase.co", "synthetic-secret");
  await expect(resetUsers(outside)).rejects.toThrow("cliente de pruebas verificado");
  await expect(resetAll(outside)).rejects.toThrow("cliente de pruebas verificado");
});
