import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachSessionRequestSchema,
  type CoachSessionRequest,
} from "@/domain/coach-session-mutation";
import { defaultPrescriptionInput, parsePrescriptionInput } from "@/domain/prescription-input";
import { readStoredTrainingPrescription } from "@/domain/stored-prescription";
import { mondayOf, santiagoDate } from "@/domain/dates";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { mutateCoachSession } from "./coach-session";

const admin = adminClient();
describe("T219 · operaciones canónicas del coach por PostgREST", () => {
  let coach: AdminClient;
  let coachId: string;
  let coachLogin: { email: string; password: string };
  const students: { id: string; db: AdminClient }[] = [];
  let programId: string, sessionId: string, weightRow: string, timeRow: string;
  const weightId = randomUUID(),
    timeId = randomUUID();
  const prescribed = (kind: "weight_reps" | "duration") =>
    parsePrescriptionInput(defaultPrescriptionInput(kind));
  beforeAll(async () => {
    await resetUsers(admin);
    const c = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "operations-coach@test.local",
    });
    coachId = c.id;
    coachLogin = { email: c.email, password: c.password };
    coach = await signedInClient(c.email, c.password);
    for (let i = 0; i < 3; i++) {
      const person = await createProfileUser(admin, {
        role: "student",
        name: "Alumno",
        email: `operations-${i}@test.local`,
        coachId,
      });
      students.push({ id: person.id, db: await signedInClient(person.email, person.password) });
    }
    expect(
      (
        await coach.from("exercises").insert([
          {
            id: weightId,
            coach_id: coachId,
            name: "Carga",
            muscle_group: "Core",
            record_type: "weight_reps",
          },
          {
            id: timeId,
            coach_id: coachId,
            name: "Tiempo",
            muscle_group: "Core",
            record_type: "duration",
          },
        ])
      ).error,
    ).toBeNull();
  });
  beforeEach(async () => {
    programId = randomUUID();
    sessionId = randomUUID();
    weightRow = randomUUID();
    timeRow = randomUUID();
    expect(
      (
        await coach
          .from("programs")
          .insert({ id: programId, coach_id: coachId, name: "Operaciones", weeks_count: 4 })
      ).error,
    ).toBeNull();
    expect(
      (
        await coach
          .from("program_sessions")
          .insert({ id: sessionId, program_id: programId, week_number: 1, label: "A" })
      ).error,
    ).toBeNull();
    expect(
      (
        await coach.from("session_exercises").insert([
          {
            id: weightRow,
            program_session_id: sessionId,
            exercise_id: weightId,
            position: 0,
            sets: 3,
            reps_min: null,
            reps_max: null,
            typed_prescription: prescribed("weight_reps"),
            note: "Peso original",
          },
          {
            id: timeRow,
            program_session_id: sessionId,
            exercise_id: timeId,
            position: 1,
            sets: 3,
            reps_min: null,
            reps_max: null,
            typed_prescription: prescribed("duration"),
            note: "Tiempo original",
          },
        ])
      ).error,
    ).toBeNull();
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await admin.from("programs").delete().eq("coach_id", coachId);
    await resetUsers(admin);
  });
  async function request(
    operation: string,
    data: unknown,
    sid = sessionId,
  ): Promise<CoachSessionRequest> {
    const row = await coach.from("program_sessions").select("revision").eq("id", sid).single();
    expect(row.error).toBeNull();
    return coachSessionRequestSchema.parse({
      version: 2,
      id: randomUUID(),
      revision: row.data!.revision,
      operation,
      data,
    });
  }
  async function rows() {
    const result = await coach
      .from("session_exercises")
      .select("*")
      .eq("program_session_id", sessionId)
      .order("position");
    expect(result.error).toBeNull();
    return result.data!;
  }
  it("añade una selección completa y confirma el mismo intento sin duplicarla", async () => {
    const added = randomUUID();
    const attempt = await request("add", { items: [{ id: added, exerciseId: weightId }] });
    expect(await mutateCoachSession(coach, sessionId, attempt)).toMatchObject({
      ok: true,
      result: { id: attempt.id, status: "applied" },
    });
    expect(await mutateCoachSession(coach, sessionId, attempt)).toMatchObject({
      ok: true,
      result: { id: attempt.id, status: "duplicate" },
    });
    const result = await rows();
    expect(result).toHaveLength(3);
    expect(readStoredTrainingPrescription(result.find((row) => row.id === added)!)).toEqual(
      prescribed("weight_reps"),
    );
  });
  it("edita solo dimensiones elegidas, preservando indicaciones y otros ejercicios", async () => {
    const attempt = await request("prescribe", {
      rows: [
        {
          id: weightRow,
          exerciseId: weightId,
          changes: { targetWeightKg: 0, repsMin: 6, restSeconds: 90 },
        },
      ],
    });
    expect((await mutateCoachSession(coach, sessionId, attempt)).ok).toBe(true);
    const result = await rows();
    expect(result[0]).toMatchObject({ note: "Peso original", rest_seconds: 90 });
    expect(readStoredTrainingPrescription(result[0]).target).toMatchObject({
      repsMin: 6,
      repsMax: 12,
      targetWeightKg: 0,
    });
    expect(result[1]).toMatchObject({ note: "Tiempo original", rest_seconds: null });
    expect(readStoredTrainingPrescription(result[1])).toEqual(prescribed("duration"));
  });
  it("un lote inválido no guarda ni la primera nota ni el recibo", async () => {
    const attempt = await request("prescribe", {
      rows: [
        { id: weightRow, exerciseId: weightId, changes: { note: "No debe persistir" } },
        { id: timeRow, exerciseId: timeId, changes: { targetWeightKg: null } },
      ],
    });
    expect(await mutateCoachSession(coach, sessionId, attempt)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect((await rows())[0].note).toBe("Peso original");
    expect(
      (
        await coach
          .from("coach_training_receipts")
          .select("request_id")
          .eq("request_id", attempt.id)
      ).data,
    ).toEqual([]);
  });
  it("dos pestañas con la misma revisión no confirman cambios distintos", async () => {
    const first = await request("prescribe", {
      rows: [{ id: weightRow, exerciseId: weightId, changes: { note: "Primera" } }],
    });
    const second = coachSessionRequestSchema.parse({
      ...first,
      id: randomUUID(),
      data: { rows: [{ id: weightRow, exerciseId: weightId, changes: { note: "Segunda" } }] },
    });
    const results = await Promise.all([
      mutateCoachSession(coach, sessionId, first),
      mutateCoachSession(coach, sessionId, second),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "conflict" }]);
    const receipts = await coach
      .from("coach_training_receipts")
      .select("request_id")
      .in("request_id", [first.id, second.id]);
    expect(receipts.data).toHaveLength(1);
    expect(["Primera", "Segunda"]).toContain((await rows())[0].note);
  });
  it("cuatro reintentos concurrentes confirman un solo agregado", async () => {
    const attempt = await request("add", { items: [{ id: randomUUID(), exerciseId: timeId }] });
    const results = await Promise.all(
      Array.from({ length: 4 }, () => mutateCoachSession(coach, sessionId, attempt)),
    );
    expect(
      results.filter((result) => result.ok && result.result.status === "applied"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.ok && result.result.status === "duplicate"),
    ).toHaveLength(3);
    expect(await rows()).toHaveLength(3);
  });
  it("configura alternativas de otro tipo y las conserva en una copia", async () => {
    const alternative = prescribed("duration");
    alternative.target.targetDurationSeconds = 65;
    expect(
      (
        await mutateCoachSession(
          coach,
          sessionId,
          await request("alternatives", {
            rowId: weightRow,
            alternatives: [{ exerciseId: timeId, prescribed: alternative }],
          }),
        )
      ).ok,
    ).toBe(true);
    const copyId = randomUUID();
    expect(
      await mutateCoachSession(
        coach,
        sessionId,
        await request("duplicate", { copyId, rowId: weightRow }),
      ),
    ).toMatchObject({ ok: true, result: { copyId, copyKind: "exercise" } });
    const copied = await coach
      .from("session_exercise_alternatives")
      .select("*")
      .eq("session_exercise_id", copyId)
      .single();
    expect(copied.error).toBeNull();
    expect(readStoredTrainingPrescription(copied.data!)).toEqual(alternative);
  });
  it("ordena, agrupa y retira sin cambiar los objetivos ni dejar un grupo de uno", async () => {
    expect(
      (
        await mutateCoachSession(
          coach,
          sessionId,
          await request("order", { ids: [timeRow, weightRow] }),
        )
      ).ok,
    ).toBe(true);
    const group = randomUUID();
    expect(
      (
        await mutateCoachSession(
          coach,
          sessionId,
          await request("layout", {
            items: [timeRow, weightRow].map((id) => ({
              id,
              restSeconds: null,
              supersetId: group,
              supersetRestSeconds: 60,
            })),
          }),
        )
      ).ok,
    ).toBe(true);
    expect((await rows()).map((row) => row.id)).toEqual([timeRow, weightRow]);
    expect(
      (await mutateCoachSession(coach, sessionId, await request("remove", { rowId: weightRow })))
        .ok,
    ).toBe(true);
    const remaining = await rows();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].superset_id).toBeNull();
    expect(readStoredTrainingPrescription(remaining[0])).toEqual(prescribed("duration"));
  });
  it("confirma una copia tras borrar el origen y no la resucita tras borrar su programa", async () => {
    const copyId = randomUUID();
    const attempt = await request("duplicate", { copyId, rowId: null });
    expect((await mutateCoachSession(coach, sessionId, attempt)).ok).toBe(true);
    expect((await coach.from("program_sessions").delete().eq("id", sessionId)).error).toBeNull();
    expect(await mutateCoachSession(coach, sessionId, attempt)).toMatchObject({
      ok: true,
      result: { status: "duplicate", copyId },
    });
    expect((await coach.from("programs").delete().eq("id", programId)).error).toBeNull();
    expect(await mutateCoachSession(coach, sessionId, attempt)).toMatchObject({
      ok: true,
      result: { status: "removed", copyId },
    });
    expect((await coach.from("program_sessions").select("id").eq("id", copyId)).data).toEqual([]);
  });
  it("rechaza reutilizar un intento con otra sesión o contenido", async () => {
    const attempt = await request("prescribe", {
      rows: [{ id: weightRow, exerciseId: weightId, changes: { note: "Única" } }],
    });
    expect((await mutateCoachSession(coach, sessionId, attempt)).ok).toBe(true);
    expect(await mutateCoachSession(coach, randomUUID(), attempt)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      await mutateCoachSession(coach, sessionId, { ...attempt, data: { rows: [], title: "Otro" } }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect((await rows())[0].note).toBe("Única");
  });
  it("todos los alumnos quedan fuera de las operaciones y recibos del coach", async () => {
    const attempt = await request("remove", { rowId: weightRow });
    for (const person of students) {
      expect(await mutateCoachSession(person.db, sessionId, attempt)).toEqual({
        ok: false,
        reason: "forbidden",
      });
      expect((await person.db.from("coach_training_receipts").select("request_id")).data).toEqual(
        [],
      );
    }
    expect(await rows()).toHaveLength(2);
  });
  it("un token rechazado exige acceso sin modificar el intento", async () => {
    const expired = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: "Bearer invalid-session-test" } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const attempt = await request("remove", { rowId: weightRow });
    const frozen = JSON.stringify(attempt);
    expect(await mutateCoachSession(expired, sessionId, attempt)).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(JSON.stringify(attempt)).toBe(frozen);
    expect(await rows()).toHaveLength(2);
  });
  it("una sesión ausente tiene una causa pública sin revelar datos ajenos", async () => {
    const attempt = await request("remove", { rowId: weightRow });
    expect(await mutateCoachSession(coach, randomUUID(), attempt)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
  it("la semana actual y el coach desactivado devuelven causas públicas", async () => {
    const assigned = await coach.rpc("assign_program", {
      p_template_id: programId,
      p_student_id: students[0].id,
      p_start_date: mondayOf(santiagoDate(new Date())),
    });
    expect(assigned.error).toBeNull();
    const assignedSession = await coach
      .from("program_sessions")
      .select("id,revision,session_exercises(id)")
      .eq("program_id", assigned.data!)
      .single();
    expect(assignedSession.error).toBeNull();
    const value = assignedSession.data!;
    const attempt = coachSessionRequestSchema.parse({
      version: 2,
      id: randomUUID(),
      revision: value.revision,
      operation: "remove",
      data: { rowId: value.session_exercises[0].id },
    });
    expect(await mutateCoachSession(coach, value.id, attempt)).toEqual({
      ok: false,
      reason: "week_locked",
    });
    expect(
      (await admin.from("profiles").update({ is_active: false }).eq("id", coachId)).error,
    ).toBeNull();
    try {
      expect(await mutateCoachSession(coach, value.id, attempt)).toEqual({
        ok: false,
        reason: "forbidden",
      });
    } finally {
      await admin.from("profiles").update({ is_active: true }).eq("id", coachId);
    }
  });
  it.each(["lost", "malformed", "revision"] as const)(
    "conserva el intento ante respuesta %s posterior al commit",
    async (mode) => {
      const added = randomUUID();
      const attempt = await request("add", { items: [{ id: added, exerciseId: timeId }] });
      const before = JSON.stringify(attempt);
      const original = globalThis.fetch;
      const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const response = await original(input, init);
        const path =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (path.includes("/rpc/mutate_coach_session") && response.ok) {
          const body: unknown = await response.json();
          if (mode === "lost") throw new TypeError("respuesta_perdida_simulada");
          return new Response(
            JSON.stringify({
              ...(body as Record<string, unknown>),
              ...(mode === "revision" ? { revision: attempt.revision - 1 } : { id: randomUUID() }),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return response;
      });
      try {
        const uncertain = await signedInClient(coachLogin.email, coachLogin.password);
        expect(await mutateCoachSession(uncertain, sessionId, attempt)).toEqual({
          ok: false,
          reason: "uncertain",
        });
      } finally {
        spy.mockRestore();
      }
      expect(JSON.stringify(attempt)).toBe(before);
      expect((await rows()).filter((row) => row.id === added)).toHaveLength(1);
      expect(await mutateCoachSession(coach, sessionId, attempt)).toMatchObject({
        ok: true,
        result: { status: "duplicate" },
      });
    },
  );
  it("entrada inválida no toca la red y una excepción conserva su incertidumbre", async () => {
    const attempt = await request("remove", { rowId: weightRow });
    const spy = vi.spyOn(coach, "rpc");
    try {
      expect(await mutateCoachSession(coach, sessionId, { ...attempt, revision: 1.5 })).toEqual({
        ok: false,
        reason: "invalid",
      });
      expect(spy).not.toHaveBeenCalled();
      spy.mockImplementation(() => {
        throw new Error("fallo_simulado");
      });
      expect(await mutateCoachSession(coach, sessionId, attempt)).toEqual({
        ok: false,
        reason: "uncertain",
      });
    } finally {
      spy.mockRestore();
    }
    expect(await rows()).toHaveLength(2);
  });
});
