import { describe, expect, it, vi } from "vitest";
import { DATA_TIMEOUT_MS, fetchWithTimeout } from "./fetch-with-timeout";

// fetch simulado: respeta la señal de aborto como lo hace el real
function slowFetch(delayMs: number) {
  return vi.fn(
    (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(new Response("ok")), delayMs);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(init.signal!.reason);
        });
      }),
  );
}

describe("fetchWithTimeout (DC-20: 10 segundos)", () => {
  it("el límite es de 10 segundos", () => expect(DATA_TIMEOUT_MS).toBe(10_000));

  it("devuelve la respuesta si llega a tiempo", async () => {
    const res = await fetchWithTimeout(slowFetch(5), 100)("https://x.test");
    expect(await res.text()).toBe("ok");
  });

  it("aborta con un error claro si se pasa del tiempo", async () => {
    await expect(fetchWithTimeout(slowFetch(500), 20)("https://x.test")).rejects.toThrow(/tard/i);
  });

  it("respeta una señal de aborto del llamador", async () => {
    const controller = new AbortController();
    const promise = fetchWithTimeout(slowFetch(500), 1000)("https://x.test", {
      signal: controller.signal,
    });
    controller.abort(new Error("cancelado"));
    await expect(promise).rejects.toThrow(/cancelado/);
  });

  it("limpia el temporizador cuando termina (no deja trabajo pendiente)", async () => {
    const spy = vi.spyOn(globalThis, "clearTimeout");
    await fetchWithTimeout(slowFetch(1), 1000)("https://x.test");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
