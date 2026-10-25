import { describe, expect, it, vi } from "vitest";
import { AccountRemovalController, REMOVAL_KEY, clearAccountTraining } from "./account-removal";
import type { TrainingStorage } from "./training";
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
function setup() {
  const values = new Map<string, string>();
  const storage: TrainingStorage = {
    get: vi.fn(async (k) => values.get(k) ?? null),
    set: vi.fn(async (k, v) => {
      values.set(k, v);
    }),
    remove: vi.fn(async (k) => {
      values.delete(k);
    }),
  };
  const cleanup = vi.fn(async (userId: string) => {
    await clearAccountTraining(storage, userId);
  });
  return { values, storage, cleanup, controller: new AccountRemovalController(storage, cleanup) };
}
describe("eliminación recuperable del dispositivo", () => {
  it("conserva la confirmación conocida si falla su escritura después del servidor", async () => {
    const x = setup();
    await x.controller.restore();
    vi.mocked(x.storage.set).mockImplementation(async (key, value) => {
      if (JSON.parse(value).phase === "confirmed") throw Error("quota");
      x.values.set(key, value);
    });
    const remove = vi.fn(async () => {});
    await expect(x.controller.request(id, remove)).rejects.toThrow();
    expect(x.controller.getSnapshot().record?.phase).toBe("confirmed");
    await x.controller.finishCleanup();
    expect(remove).toHaveBeenCalledOnce();
  });
  it("protege el intento antes del servidor y limpia solo la cuenta confirmada", async () => {
    const x = setup();
    x.values.set(`is:native-training:v1:${id}`, "registro");
    x.values.set(`is:native-training:v1:${other}`, "otro");
    x.values.set("is:native-appearance:v1", "dark");
    await x.controller.restore();
    const remove = vi.fn(async () => {
      expect(JSON.parse(x.values.get(REMOVAL_KEY)!).phase).toBe("requested");
    });
    await x.controller.request(id, remove);
    expect(remove).toHaveBeenCalledOnce();
    expect(x.values.get(`is:native-training:v1:${id}`)).toBeUndefined();
    expect(x.values.get(`is:native-training:v1:${other}`)).toBe("otro");
    expect(x.values.get("is:native-appearance:v1")).toBe("dark");
    expect(x.controller.getSnapshot().completion).toBe("server_deleted");
  });
  it("no envía si no puede confirmar el recibo y conserva registros ante respuesta perdida", async () => {
    const x = setup();
    await x.controller.restore();
    vi.mocked(x.storage.set).mockRejectedValueOnce(Error("quota"));
    const remove = vi.fn(async () => {});
    await expect(x.controller.request(id, remove)).rejects.toThrow();
    expect(remove).not.toHaveBeenCalled();
    expect(x.cleanup).not.toHaveBeenCalled();
    const y = setup();
    y.values.set(`is:native-training:v1:${id}`, "pendiente");
    await y.controller.restore();
    await expect(
      y.controller.request(id, async () => {
        throw Error("respuesta perdida");
      }),
    ).rejects.toThrow();
    expect(y.controller.getSnapshot().record?.phase).toBe("requested");
    expect(y.values.get(`is:native-training:v1:${id}`)).toBe("pendiente");
    await expect(y.controller.finishCleanup()).rejects.toThrow();
    await y.controller.preserve();
    expect(y.values.get(`is:native-training:v1:${id}`)).toBe("pendiente");
  });
  it("tras servidor confirmado, reabrir reintenta solo limpieza local", async () => {
    const x = setup();
    await x.controller.restore();
    x.cleanup.mockRejectedValueOnce(Error("storage"));
    const remove = vi.fn(async () => {});
    await expect(x.controller.request(id, remove)).rejects.toThrow();
    expect(JSON.parse(x.values.get(REMOVAL_KEY)!).phase).toBe("confirmed");
    const reopened = new AccountRemovalController(x.storage, x.cleanup);
    await reopened.restore();
    await reopened.finishCleanup();
    expect(remove).toHaveBeenCalledOnce();
    expect(x.values.has(REMOVAL_KEY)).toBe(false);
    expect(reopened.getSnapshot().completion).toBe("server_deleted");
  });
  it("formato desconocido se conserva; incertidumbre necesita descarte explícito y no afirma éxito remoto", async () => {
    const x = setup();
    x.values.set(REMOVAL_KEY, '{"version":9}');
    await x.controller.restore();
    expect(x.controller.getSnapshot().blocked).toBe(true);
    await expect(x.controller.preserve()).rejects.toThrow();
    expect(x.values.get(REMOVAL_KEY)).toBe('{"version":9}');
    const y = setup();
    y.values.set(REMOVAL_KEY, JSON.stringify({ version: 1, userId: id, phase: "requested" }));
    await y.controller.restore();
    await y.controller.finishCleanup(true);
    expect(y.controller.getSnapshot().completion).toBe("local_only");
  });
  it("una eliminación local no confirmada conserva el recibo para reintentar", async () => {
    const x = setup();
    x.values.set(`is:native-training:v1:${id}`, "registro");
    x.values.set(REMOVAL_KEY, JSON.stringify({ version: 1, userId: id, phase: "confirmed" }));
    vi.mocked(x.storage.remove).mockResolvedValue(undefined);
    await x.controller.restore();
    await expect(x.controller.finishCleanup()).rejects.toThrow();
    expect(x.values.has(REMOVAL_KEY)).toBe(true);
  });
});
