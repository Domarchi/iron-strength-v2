import { describe, expect, it, vi } from "vitest";
import { createMobileCommentsApi, type MobileCommentsIdentity } from "./comments-api";
const id = "11111111-1111-4111-8111-111111111111",
  commentId = "22222222-2222-4222-8222-222222222222";
function setup() {
  const identity = {
    unread: vi.fn<MobileCommentsIdentity["unread"]>(async () => []),
    list: vi.fn<MobileCommentsIdentity["list"]>(async () => ({
      items: [],
      nextCursor: null,
      unreadCount: 0,
    })),
    publish: vi.fn<MobileCommentsIdentity["publish"]>(async () => ({
      ok: true,
      status: "created",
      id: commentId,
    })),
    remove: vi.fn<MobileCommentsIdentity["remove"]>(async () => ({ ok: true, status: "absent" })),
    markRead: vi.fn<MobileCommentsIdentity["markRead"]>(async () => true),
  };
  const authorize = vi.fn(async (token: string) => (token === "valid" ? identity : null));
  return { api: createMobileCommentsApi({ authorize }), authorize, identity };
}
const get = (query = "", token = "valid") =>
  new Request("https://example.test/" + query, { headers: { Authorization: "Bearer " + token } });
const post = (body: unknown, token = "valid") =>
  new Request("https://example.test", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("API de comentarios nativos", () => {
  it("rechaza identidad/UUID/consultas abiertas antes de leer o publicar", async () => {
    const x = setup();
    expect((await x.api.list(get("", "bad"), id)).status).toBe(401);
    expect((await x.api.list(get(), "other")).status).toBe(404);
    expect((await x.api.list(get("?studentId=" + id), id)).status).toBe(400);
    expect((await x.api.unread(get("?studentId=" + id))).status).toBe(400);
    expect((await x.api.list(get("?cursor=bad"), id)).status).toBe(400);
    expect(x.identity.list).not.toHaveBeenCalled();
    expect(
      (await x.api.publish(post({ id: commentId, body: "Hola", authorId: id }), id)).status,
    ).toBe(400);
    expect((await x.api.publish(post({ id: commentId, body: " " }), id)).status).toBe(400);
    expect((await x.api.publish(post({ id: commentId, body: "x".repeat(501) }), id)).status).toBe(
      400,
    );
    expect(x.identity.publish).not.toHaveBeenCalled();
  });
  it("lectura y confirmaciones no llevan cookies/caché; publicar conserva identidad estable", async () => {
    const x = setup();
    const page = await x.api.list(get(), id);
    expect(await page.json()).toEqual({
      version: 1,
      workoutId: id,
      items: [],
      nextCursor: null,
      unreadCount: 0,
    });
    expect(page.headers.get("Cache-Control")).toContain("no-store");
    expect(page.headers.get("Set-Cookie")).toBeNull();
    const result = await x.api.publish(post({ id: commentId, body: " Hola " }), id);
    expect(result.status).toBe(201);
    expect(await result.json()).toEqual({
      version: 1,
      workoutId: id,
      id: commentId,
      status: "created",
      ok: true,
    });
    expect(x.identity.publish).toHaveBeenCalledWith(id, { id: commentId, body: "Hola" });
    expect(x.identity.markRead).not.toHaveBeenCalled();
    expect((await x.api.markRead(post({}), id)).status).toBe(200);
    expect((await x.api.remove(post({ id: commentId }), id)).status).toBe(200);
  });
  it("ausencia, conflicto y caída no se presentan como conversación vacía o mensaje enviado", async () => {
    const x = setup();
    x.identity.list.mockResolvedValueOnce(null);
    expect((await x.api.list(get(), id)).status).toBe(404);
    x.identity.publish.mockResolvedValueOnce({ ok: false, reason: "conflict" });
    expect((await x.api.publish(post({ id: commentId, body: "Hola" }), id)).status).toBe(409);
    x.identity.publish.mockResolvedValueOnce({ ok: false, reason: "removed" });
    const removed = await x.api.publish(post({ id: commentId, body: "Hola" }), id);
    expect(removed.status).toBe(409);
    expect((await removed.json()).error.code).toBe("removed");
    x.identity.list.mockRejectedValueOnce(Error("private database details"));
    const failed = await x.api.list(get(), id);
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("private database details");
  });
});
