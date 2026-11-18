import { describe, expect, it, vi } from "vitest";
import { createMobileStudentsApi } from "./students-api";

const value = {
  version: 1 as const,
  students: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      fullName: "Ana Prueba",
      lastWorkoutDate: "2026-11-10",
      week: { kind: "active" as const, programName: "Fuerza", planned: 3, done: 1, deload: false },
      signals: [{ kind: "comments" as const, label: "1 comentario pendiente", detail: "Revisa." }],
    },
  ],
};
const req = (query = "", token = "valid") =>
  new Request("https://example.test/" + query, { headers: { Authorization: "Bearer " + token } });

describe("alumnos del coach en el teléfono", () => {
  it("exige identidad, rol de coach y ninguna consulta antes de leer", async () => {
    const read = vi.fn(async () => value);
    const api = createMobileStudentsApi({
      authorize: async (t) =>
        t === "coach" ? { isCoach: true, read } : t === "student" ? { isCoach: false, read } : null,
    });
    expect((await api.read(req("", "bad"))).status).toBe(401);
    expect((await api.read(req("", "student"))).status).toBe(403);
    expect((await api.read(req("?studentId=x", "coach"))).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
    const ok = await api.read(req("", "coach"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(value);
  });
  it("rechaza contratos inválidos y no filtra detalles internos", async () => {
    const bad = createMobileStudentsApi({
      authorize: async () => ({
        isCoach: true,
        read: async () => ({ ...value, students: [{ ...value.students[0], id: "no-uuid" }] }),
      }),
    });
    expect((await bad.read(req())).status).toBe(503);
    const boom = createMobileStudentsApi({
      authorize: async () => ({
        isCoach: true,
        read: async () => {
          throw Error("private details");
        },
      }),
    });
    const r = await boom.read(req());
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain("private details");
  });
});
