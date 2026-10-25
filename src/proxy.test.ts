import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@/lib/supabase/env", () => ({
  supabaseUrl: () => "https://test.invalid",
  supabasePublishableKey: () => "test",
}));
afterEach(() => vi.resetAllMocks());

describe("información pública ante indisponibilidad de identidad", () => {
  it.each(["/privacy", "/support", "/delete-account"])(
    "%s no depende de Supabase ni refresca cookies",
    async (path) => {
      createServerClient.mockImplementation(() => {
        throw new Error("Servicio no disponible");
      });
      const response = await proxy(
        new NextRequest(`https://test.invalid${path}`, {
          headers: { Cookie: "sb-test-auth-token=invalid" },
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(createServerClient).not.toHaveBeenCalled();
    },
  );
  it.each(["/privacy/private", "/supportx", "/delete-account/confirm", "/account", "/week"])(
    "%s conserva el control de acceso",
    async (path) => {
      createServerClient.mockReturnValue({
        auth: { getClaims: vi.fn().mockResolvedValue({ data: null }) },
      });
      const response = await proxy(new NextRequest(`https://test.invalid${path}`));
      expect(createServerClient).toHaveBeenCalledOnce();
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://test.invalid/login");
    },
  );
});
