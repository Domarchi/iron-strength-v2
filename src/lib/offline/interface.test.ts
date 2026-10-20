// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { prepareOfflineInterface } from "./interface";
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
it("no registra una actualización con un entrenamiento pendiente incluso si la pestaña anterior se cerró", async () => {
  localStorage.setItem("is:draft:v1:old-account:session", "unknown");
  const register = vi.fn();
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("navigator", {
    serviceWorker: { getRegistration: async () => ({ active: null }), register },
  });
  await expect(prepareOfflineInterface()).rejects.toThrow("Termina o descarta");
  expect(register).not.toHaveBeenCalled();
});
it("una interfaz ya completa permite descargar datos sin registrar otro worker durante el entrenamiento", async () => {
  localStorage.setItem("is:draft:v2:a:s", "{}");
  const register = vi.fn();
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal(
    "MessageChannel",
    class {
      port1 = {
        onmessage: (event: { data: unknown }) => {
          void event;
        },
        close: () => {},
      };
      port2 = { reply: (data: unknown) => this.port1.onmessage({ data }) };
    },
  );
  const active = {
    postMessage: (_msg: unknown, ports: { reply: (data: unknown) => void }[]) =>
      ports[0].reply({ ready: true, buildId: process.env.NEXT_PUBLIC_OFFLINE_BUILD_ID }),
  };
  vi.stubGlobal("navigator", {
    serviceWorker: { getRegistration: async () => ({ active }), register },
  });
  await prepareOfflineInterface();
  expect(register).not.toHaveBeenCalled();
});
