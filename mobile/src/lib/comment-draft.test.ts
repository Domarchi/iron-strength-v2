import { describe, it, expect, vi } from "vitest";
import { CommentDraftController } from "./comment-draft";
import type { TrainingStorage } from "./training";
const userId = "11111111-1111-4111-8111-111111111111",
  workoutId = "22222222-2222-4222-8222-222222222222",
  commentId = "33333333-3333-4333-8333-333333333333";
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
  const send = vi.fn(async () => {});
  return {
    values,
    storage,
    send,
    controller: new CommentDraftController(userId, storage, send, () => commentId),
  };
}
describe("comentario persistente por cuenta", () => {
  it("un rechazo conocido conserva el texto y exige resolverlo sin reintentos ciegos", async () => {
    const x = setup();
    await x.controller.restore();
    await x.controller.edit(workoutId, "Ya borrado");
    x.send.mockRejectedValueOnce(
      Object.assign(Error("El mensaje ya fue borrado."), { code: "removed" }),
    );
    await expect(x.controller.send()).rejects.toThrow();
    expect(x.controller.getSnapshot().rejection).toBe("removed");
    await expect(x.controller.send()).rejects.toThrow();
    expect(x.send).toHaveBeenCalledOnce();
    await x.controller.discard();
    expect(x.controller.getSnapshot().record).toBeNull();
    expect(x.controller.getSnapshot().rejection).toBeNull();
  });
  it("otra cuenta no recupera ni borra el comentario pendiente de la primera", async () => {
    const x = setup();
    await x.controller.restore();
    await x.controller.edit(workoutId, "Solo mi cuenta");
    const other = new CommentDraftController(workoutId, x.storage, x.send, () => commentId);
    await other.restore();
    expect(other.getSnapshot().record).toBeNull();
    await other.clearForLogout();
    expect(x.values.get(`is:native-comment:v1:${userId}`)).toContain("Solo mi cuenta");
  });
  it("recupera texto/identidad, impide sobrescribir otro entrenamiento y confirma solo tras servidor", async () => {
    const x = setup();
    await x.controller.restore();
    await x.controller.edit(workoutId, " Mi mensaje ");
    const reopened = new CommentDraftController(userId, x.storage, x.send, () =>
      crypto.randomUUID(),
    );
    await reopened.restore();
    expect(reopened.getSnapshot().record).toMatchObject({
      id: commentId,
      body: " Mi mensaje ",
      workoutId,
    });
    await expect(reopened.edit(userId, "otro")).rejects.toThrow();
    await expect(reopened.clearForLogout()).rejects.toThrow();
    await reopened.send();
    expect(x.send).toHaveBeenCalledWith({ workoutId, id: commentId, body: "Mi mensaje" });
    expect(reopened.getSnapshot().record).toBeNull();
  });
  it("respuesta perdida conserva ID/texto congelados y reintenta sin cambio", async () => {
    const x = setup();
    await x.controller.restore();
    await x.controller.edit(workoutId, "Pendiente");
    x.send.mockRejectedValueOnce(Error("network"));
    await expect(x.controller.send()).rejects.toThrow();
    expect(x.controller.getSnapshot().record?.phase).toBe("pending");
    await expect(x.controller.edit(workoutId, "otro texto")).rejects.toThrow();
    const reopened = new CommentDraftController(userId, x.storage, x.send, () =>
      crypto.randomUUID(),
    );
    await reopened.restore();
    await reopened.send();
    expect(x.send.mock.calls[0]).toEqual(x.send.mock.calls[1]);
  });
  it("si falla el guardado previo no envía; otro formato/cuenta no se interpreta ni borra", async () => {
    const x = setup();
    await x.controller.restore();
    await x.controller.edit(workoutId, "Mensaje");
    vi.mocked(x.storage.set).mockRejectedValueOnce(Error("quota"));
    await expect(x.controller.send()).rejects.toThrow();
    expect(x.send).not.toHaveBeenCalled();
    const key = `is:native-comment:v1:${userId}`;
    x.values.set(key, '{"version":9}');
    const unknown = new CommentDraftController(userId, x.storage, x.send, () => commentId);
    await unknown.restore();
    expect(unknown.getSnapshot().blocked).toBe(true);
    await expect(unknown.discard()).rejects.toThrow();
    expect(x.values.get(key)).toBe('{"version":9}');
  });
  it("fallo al limpiar tras envío mantiene el intento para confirmar el duplicado", async () => {
    const x = setup();
    await x.controller.restore();
    await x.controller.edit(workoutId, "Confirmar");
    vi.mocked(x.storage.remove).mockRejectedValueOnce(Error("storage"));
    await expect(x.controller.send()).rejects.toThrow();
    expect(x.controller.getSnapshot().record?.id).toBe(commentId);
    await x.controller.send();
    expect(x.send.mock.calls[0]).toEqual(x.send.mock.calls[1]);
    expect(x.controller.getSnapshot().record).toBeNull();
  });
});
