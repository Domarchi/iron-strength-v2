// @vitest-environment jsdom
import { createDraft } from "@/lib/workout/runner-state";
import { legacyDraftKey } from "@/lib/workout/draft";
import { afterEach, expect, it, vi } from "vitest";
import { prepareOfflineInterface, ensureWorkoutInterface } from "./interface";
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

it("prepara una interfaz anterior antes de crear otra sesión, sin actualizar con pendientes de otra cuenta", async () => {
  localStorage.setItem("is:draft:v2:other:session", "unknown");
  const register = vi.fn();
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal(
    "MessageChannel",
    class {
      port1 = { onmessage: (_event: { data: unknown }) => {}, close: () => {} };
      port2 = { reply: (data: unknown) => this.port1.onmessage({ data }) };
    },
  );
  const active = {
    postMessage: (_msg: unknown, ports: { reply: (data: unknown) => void }[]) =>
      ports[0].reply({ ready: true, buildId: "older" }),
  };
  vi.stubGlobal("navigator", {
    serviceWorker: { getRegistration: async () => ({ active }), register },
  });
  await expect(ensureWorkoutInterface("me", "new-session")).rejects.toThrow("Termina o descarta");
  expect(register).not.toHaveBeenCalled();
});
it("la capacidad compatible permite empezar sin activar otra interfaz durante otros pendientes", async () => {
  localStorage.setItem("is:draft:v3:other:session", "unknown");
  const register = vi.fn();
  vi.stubGlobal(
    "MessageChannel",
    class {
      port1 = { onmessage: (_event: { data: unknown }) => {}, close: () => {} };
      port2 = { reply: (data: unknown) => this.port1.onmessage({ data }) };
    },
  );
  const active = {
    postMessage: (_msg: unknown, ports: { reply: (data: unknown) => void }[]) =>
      ports[0].reply({
        ready: true,
        buildId: "different-compatible-build",
        draftVersions: [1, 2, 3],
      }),
  };
  vi.stubGlobal("navigator", {
    serviceWorker: { getRegistration: async () => ({ active }), register },
  });
  await ensureWorkoutInterface("me", "new-session");
  expect(register).not.toHaveBeenCalled();
});

it("recuperar un borrador conocido no activa ni consulta otra interfaz", async () => {
  const value = {
    ...createDraft({
      workoutId: crypto.randomUUID(),
      userId: "me",
      plannedSession: { id: "session", programId: "program", label: "A" },
      exercises: [],
      now: new Date(),
    }),
    version: 1,
  };
  localStorage.setItem(legacyDraftKey("me", "session"), JSON.stringify(value));
  const register = vi.fn(),
    postMessage = vi.fn();
  vi.stubGlobal("navigator", {
    serviceWorker: { getRegistration: async () => ({ active: { postMessage } }), register },
  });
  await ensureWorkoutInterface("me", "session");
  expect(register).not.toHaveBeenCalled();
  expect(postMessage).not.toHaveBeenCalled();
});

it("actualiza una interfaz anterior sin borradores antes de permitir un inicio nuevo", async () => {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal(
    "MessageChannel",
    class {
      port1 = { onmessage: (_event: { data: unknown }) => {}, close: () => {} };
      port2 = { reply: (data: unknown) => this.port1.onmessage({ data }) };
    },
  );
  const old = {
    postMessage: (_msg: unknown, ports: { reply: (data: unknown) => void }[]) =>
      ports[0].reply({ ready: true, buildId: "older" }),
  };
  const current = {
    state: "activated",
    postMessage: (_msg: unknown, ports: { reply: (data: unknown) => void }[]) =>
      ports[0].reply({
        ready: true,
        buildId: process.env.NEXT_PUBLIC_OFFLINE_BUILD_ID,
        draftVersions: [1, 2, 3],
      }),
  };
  const register = vi.fn(async () => ({ active: current }));
  vi.stubGlobal("navigator", {
    serviceWorker: { getRegistration: async () => ({ active: old }), register },
  });
  await ensureWorkoutInterface("me", "new-session");
  expect(register).toHaveBeenCalledTimes(1);
  expect(localStorage.length).toBe(0);
});

it("una versión preparada que espera clientes exige cerrar todas las pestañas sin iniciar otro registro", async () => {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal(
    "MessageChannel",
    class {
      port1 = { onmessage: (_event: { data: unknown }) => {}, close: () => {} };
      port2 = { reply: (data: unknown) => this.port1.onmessage({ data }) };
    },
  );
  const active = {
    postMessage: (_msg: unknown, ports: { reply: (data: unknown) => void }[]) =>
      ports[0].reply({ ready: true, buildId: "older" }),
  };
  const waiting = { state: "installed" };
  const register = vi.fn(async () => ({ active, waiting }));
  vi.stubGlobal("navigator", {
    serviceWorker: { getRegistration: async () => ({ active }), register },
  });
  await expect(ensureWorkoutInterface("me", "new-session")).rejects.toThrow(
    "Cierra todas las pestañas",
  );
  expect(localStorage.length).toBe(0);
});
