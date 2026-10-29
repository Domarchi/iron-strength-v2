// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { isCompleteOfflineInterfaceReady, prepareCompleteOfflineInterface } from "./interface";
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});
function worker(value: Record<string, unknown>) {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal(
    "MessageChannel",
    class {
      port1 = {
        onmessage: (event: { data: unknown }) => {
          void event;
        },
        close() {},
      };
      port2 = { reply: (data: unknown) => this.port1.onmessage({ data }) };
    },
  );
  const active = {
    postMessage: (_message: unknown, ports: { reply(data: unknown): void }[]) =>
      ports[0].reply(value),
  };
  const register = vi.fn();
  vi.stubGlobal("navigator", {
    serviceWorker: { getRegistration: async () => ({ active }), register },
  });
  return register;
}
const current = {
  ready: true,
  buildId: process.env.NEXT_PUBLIC_OFFLINE_BUILD_ID,
  draftVersions: [1, 2, 3],
  trainingVersions: [4],
  downloadVersions: [1],
  queuePayloadVersions: [1, 2, 3],
};
it("solo confirma recursos preparados y todos los contratos del corredor completo", async () => {
  for (const value of [
    current,
    { ...current, trainingVersions: [] },
    { ...current, trainingVersions: "4" },
    { ...current, downloadVersions: [] },
    { ...current, queuePayloadVersions: [3] },
    { ...current, ready: false },
    { ...current, buildId: "older" },
  ]) {
    worker(value);
    expect(await isCompleteOfflineInterfaceReady()).toBe(value === current);
  }
});
it("no actualiza durante un registro y rechaza una interfaz antigua que solo sabe leer borradores anteriores", async () => {
  localStorage.setItem("is:draft:v2:other:session", "pending");
  const older = { ...current, trainingVersions: undefined };
  const register = worker(older);
  await expect(prepareCompleteOfflineInterface()).rejects.toThrow(/Cierra/);
  expect(register).not.toHaveBeenCalled();
});
it("una copia actual compatible no instala otra interfaz mientras exista un registro", async () => {
  localStorage.setItem("is:draft:v4:other:training", "pending");
  const register = worker(current);
  await prepareCompleteOfflineInterface();
  expect(register).not.toHaveBeenCalled();
});
