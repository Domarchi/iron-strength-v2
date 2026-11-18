import { describe, expect, it, vi } from "vitest";
import { createMobileStudentDetailApi } from "./student-detail-api";

const id = "11111111-1111-4111-8111-111111111111";
const value = {
  version: 1 as const,
  checkin: {
    weekStart: "2026-11-09",
    answers: { sleep: 4, energy: 3, soreness: 2, motivation: 5, note: "Dormí poco" },
  },
  workouts: [{ id: "22222222-2222-4222-8222-222222222222", date: "2026-11-10", sets: 12 }],
  comments: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      workoutId: "22222222-2222-4222-8222-222222222222",
      body: "¿Puedo subir el peso?",
      createdAt: "2026-11-10T15:00:00.000Z",
      authorKind: "student" as const,
    },
  ],
};
const req = (query = "", token = "valid") =>
  new Request("https://example.test/" + query, { headers: { Authorization: "Bearer " + token } });

describe("ficha de alumno del coach en el teléfono", () => {
  it("exige identidad, rol de coach, id válido y sin parámetros antes de leer", async () => {
    const read = vi.fn(async () => value);
    const api = createMobileStudentDetailApi({
      authorize: async (t) =>
        t === "coach" ? { isCoach: true, read } : t === "student" ? { isCoach: false, read } : null,
    });
    expect((await api.read(req("", "bad"), id)).status).toBe(401);
    expect((await api.read(req("", "student"), id)).status).toBe(403);
    expect((await api.read(req("?x=1", "coach"), id)).status).toBe(400);
    expect((await api.read(req("", "coach"), "no-uuid")).status).toBe(404);
    expect(read).not.toHaveBeenCalled();
    const ok = await api.read(req("", "coach"), id);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(value);
    expect(read).toHaveBeenCalledWith(id);
  });
  it("devuelve 404 si el alumno no es visible y no filtra detalles internos", async () => {
    const none = createMobileStudentDetailApi({
      authorize: async () => ({ isCoach: true, read: async () => null }),
    });
    expect((await none.read(req(), id)).status).toBe(404);
    const boom = createMobileStudentDetailApi({
      authorize: async () => ({
        isCoach: true,
        read: async () => {
          throw Error("private details");
        },
      }),
    });
    const r = await boom.read(req(), id);
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("private");
    const bad = createMobileStudentDetailApi({
      authorize: async () => ({
        isCoach: true,
        read: async () => ({ ...value, workouts: [{ id: "x", date: "no", sets: -1 }] }),
      }),
    });
    expect((await bad.read(req(), id)).status).toBe(503);
  });
});
