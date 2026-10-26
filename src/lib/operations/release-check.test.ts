import { describe, expect, it, vi } from "vitest";
import { checkRelease } from "./release-check";

const build = "0465f35e9b004c0393da6d391e7ed433";
const response = (url: string) =>
  url.endsWith("/login")
    ? new Response(`<html>${build}</html>`, { headers: { "Content-Type": "text/html" } })
    : Response.json(
        { version: 1, error: { code: "unauthorized", message: "Vuelve a iniciar sesión." } },
        { status: 401, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } },
      );

describe("control operativo anónimo", () => {
  it("comprueba el artefacto y el rechazo de lecturas sin escribir ni enviar identidad", async () => {
    const fetcher = vi.fn(async (url: string) => response(url));
    const result = await checkRelease(build, fetcher);
    expect(result.ok).toBe(true);
    expect(result.checks).toHaveLength(6);
    expect(result.checks.slice(-2).map((c) => c.path)).toEqual([
      "/api/mobile/v1/exercises",
      "/api/mobile/v1/exercises/11111111-1111-4111-8111-111111111111",
    ]);
    for (const [url, init] of fetcher.mock.calls as unknown as [string, RequestInit][]) {
      expect(url).toMatch(/^https:\/\/iron-strength-seven\.vercel\.app\//);
      expect(init).toMatchObject({ method: "GET", credentials: "omit", redirect: "error" });
      expect(init.headers).toBeUndefined();
      expect(init.body).toBeUndefined();
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it.each(["", "https://foreign.test", build + "?token=secret", "A".repeat(32)])(
    "rechaza parámetros inválidos antes de conectar: %s",
    async (input) => {
      const fetcher = vi.fn();
      await expect(checkRelease(input, fetcher)).rejects.toThrow("BUILD_ID inválido");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("detecta otro artefacto y una API que filtra datos sin imprimirlos", async () => {
    const result = await checkRelease(build, async (url) =>
      url.endsWith("/login")
        ? new Response("otro build", { headers: { "Content-Type": "text/html" } })
        : Response.json({ privateNote: "sensitive-body" }),
    );
    expect(result.ok).toBe(false);
    expect(result.checks.map((c) => c.code)).toEqual([
      "artifact_mismatch",
      "unexpected_status",
      "unexpected_status",
      "unexpected_status",
      "unexpected_status",
      "unexpected_status",
    ]);
    expect(JSON.stringify(result)).not.toContain("sensitive-body");
  });

  it("detecta caché pública y contratos de error incompatibles", async () => {
    const result = await checkRelease(build, async (url) =>
      url.endsWith("/login")
        ? response(url)
        : Response.json(
            { version: 2, error: { code: "unauthorized" } },
            {
              status: 401,
              headers: { "Cache-Control": "public, max-age=60", Vary: "Authorization" },
            },
          ),
    );
    expect(result.ok).toBe(false);
    expect(result.checks.slice(1).every((c) => c.code === "unsafe_cache")).toBe(true);
    const contract = await checkRelease(build, async (url) =>
      url.endsWith("/login")
        ? response(url)
        : Response.json(
            { version: 2, error: { code: "unauthorized" } },
            {
              status: 401,
              headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
            },
          ),
    );
    expect(contract.checks.slice(1).every((c) => c.code === "invalid_contract")).toBe(true);
  });

  it("acota respuestas grandes y oculta errores del transporte", async () => {
    const large = await checkRelease(build, async () => new Response("x".repeat(131073)));
    expect(large.checks.every((c) => c.code === "response_too_large")).toBe(true);
    const failed = await checkRelease(build, async () => {
      throw Error("token-secret@private.test");
    });
    expect(failed.checks.every((c) => c.code === "transport_error")).toBe(true);
    expect(JSON.stringify(failed)).not.toMatch(/token-secret|private\.test/);
  });
});
