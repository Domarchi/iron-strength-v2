import { describe, expect, it, vi } from "vitest";
import { createMobileStudentReplyApi } from "./student-reply-api";

const student = "11111111-1111-4111-8111-111111111111";
const input = {
  workoutId: "22222222-2222-4222-8222-222222222222",
  id: "33333333-3333-4333-8333-333333333333",
  body: "Sí, sube 2,5 kg.",
};
const post = (body: unknown, token = "coach") =>
  new Request("https://example.test/", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("respuesta del coach a un alumno desde el teléfono", () => {
  it("exige identidad y rol de coach, y valida el cuerpo antes de escribir", async () => {
    const reply = vi.fn(async () => ({ ok: true as const, status: "created" as const }));
    const api = createMobileStudentReplyApi({
      authorize: async (t) =>
        t === "coach"
          ? { isCoach: true, reply }
          : t === "student"
            ? { isCoach: false, reply }
            : null,
    });
    expect((await api.post(post(input, "bad"), student)).status).toBe(401);
    expect((await api.post(post(input, "student"), student)).status).toBe(403);
    expect((await api.post(post(input), "no-uuid")).status).toBe(404);
    expect((await api.post(post({ ...input, body: "" }), student)).status).toBe(400);
    expect((await api.post(post({ ...input, body: "x".repeat(501) }), student)).status).toBe(400);
    expect((await api.post(post({ ...input, extra: 1 }), student)).status).toBe(400);
    expect(reply).not.toHaveBeenCalled();
    const ok = await api.post(post(input), student);
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ version: 1, status: "created", id: input.id });
    expect(reply).toHaveBeenCalledWith(student, input);
  });
  it("traduce resultados, repite sin duplicar y no filtra detalles internos", async () => {
    const make = (result: unknown) =>
      createMobileStudentReplyApi({
        authorize: async () => ({ isCoach: true, reply: async () => result as never }),
      });
    const dup = await make({ ok: true, status: "duplicate" }).post(post(input), student);
    expect(dup.status).toBe(200);
    expect((await make({ ok: false, reason: "not_found" }).post(post(input), student)).status).toBe(
      404,
    );
    expect((await make({ ok: false, reason: "conflict" }).post(post(input), student)).status).toBe(
      409,
    );
    expect((await make({ ok: false, reason: "forbidden" }).post(post(input), student)).status).toBe(
      403,
    );
    const boom = createMobileStudentReplyApi({
      authorize: async () => ({
        isCoach: true,
        reply: async () => {
          throw Error("private details");
        },
      }),
    });
    const r = await boom.post(post(input), student);
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("private");
  });
});
