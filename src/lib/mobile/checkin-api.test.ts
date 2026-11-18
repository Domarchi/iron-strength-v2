import { describe, expect, it, vi } from "vitest";
import { createMobileCheckinApi } from "./checkin-api";

const answers = { sleep: 4, energy: 3, soreness: 2, motivation: 5, note: "Buena semana" };
const current = { version: 1 as const, weekStart: "2026-11-09", answers };
const get = (query = "", token = "valid") =>
  new Request("https://example.test/" + query, { headers: { Authorization: "Bearer " + token } });
const post = (body: unknown, token = "valid") =>
  new Request("https://example.test/", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

function setup() {
  const read = vi.fn(async () => current),
    save = vi.fn(async () => current),
    authorize = vi.fn(async (token: string) => (token === "valid" ? { read, save } : null));
  return { api: createMobileCheckinApi({ authorize }), read, save };
}

describe("check-in semanal nativo", () => {
  it("lee solo con identidad válida y sin parámetros", async () => {
    const { api, read } = setup();
    expect((await api.read(get("", "bad"))).status).toBe(401);
    expect((await api.read(get("?studentId=x"))).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
    const ok = await api.read(get());
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(current);
  });
  it("guarda respuestas válidas y rechaza rangos, campos extra y cuerpos mal formados", async () => {
    const { api, save } = setup();
    expect((await api.save(post({ version: 1, answers }, "bad"))).status).toBe(401);
    for (const body of [
      { version: 1, answers: { ...answers, sleep: 6 } },
      { version: 1, answers: { ...answers, energy: 0 } },
      { version: 1, answers: { ...answers, note: "x".repeat(301) } },
      { version: 1, answers: { ...answers, studentId: "x" } },
      { version: 1, answers, weekStart: "2026-11-02" },
      { version: 2, answers },
      "no es json",
    ])
      expect((await api.save(post(body))).status).toBe(400);
    expect(save).not.toHaveBeenCalled();
    const ok = await api.save(post({ version: 1, answers }));
    expect(ok.status).toBe(200);
    expect(save).toHaveBeenCalledWith(answers);
    expect((await api.save(post({ version: 1, answers: { ...answers, note: null } }))).status).toBe(
      200,
    );
  });
  it("no filtra detalles internos ante un fallo", async () => {
    const api = createMobileCheckinApi({
      authorize: async () => ({
        read: async () => {
          throw Error("private details");
        },
        save: async () => {
          throw Error("private details");
        },
      }),
    });
    for (const response of [await api.read(get()), await api.save(post({ version: 1, answers }))]) {
      expect(response.status).toBe(503);
      expect(JSON.stringify(await response.json())).not.toContain("private details");
    }
  });
});
