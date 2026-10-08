import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getHistoryExport } from "./export";

const admin = adminClient();

describe("exportar historial (RF-47)", () => {
  let anaId: string;
  let beaId: string;
  let coachDb: AdminClient;
  let anaDb: AdminClient;
  let beaDb: AdminClient;

  beforeAll(async () => {
    await resetUsers(admin);
    const coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@test.local",
    });
    const ana = await createProfileUser(admin, {
      role: "student",
      name: "Ana",
      email: "ana@test.local",
      coachId: coach.id,
    });
    const bea = await createProfileUser(admin, {
      role: "student",
      name: "Bea",
      email: "bea@test.local",
      coachId: coach.id,
    });
    anaId = ana.id;
    beaId = bea.id;
    coachDb = await signedInClient(coach.email, coach.password);
    anaDb = await signedInClient(ana.email, ana.password);
    beaDb = await signedInClient(bea.email, bea.password);

    const squat = (
      await admin
        .from("exercises")
        .select("id")
        .eq("name", "Sentadilla")
        .is("coach_id", null)
        .single()
    ).data!.id;

    // Dos entrenamientos de Ana, el segundo con las series en desorden de inserción.
    for (const [startedAt, sets] of [
      ["2026-10-01T15:00:00Z", [[1, 1, 60, 10, false]]],
      [
        "2026-10-03T15:00:00Z",
        [
          [0, 2, 62.5, 8, false],
          [0, 1, 40, 12, true],
        ],
      ],
    ] as const) {
      const id = crypto.randomUUID();
      await admin.from("workouts").insert({
        id,
        student_id: anaId,
        started_at: startedAt,
        finished_at: startedAt,
        duration_seconds: 3000,
        session_label: "A",
      });
      await admin.from("workout_sets").insert(
        sets.map(([position, setNumber, weight, reps, warm]) => ({
          workout_id: id,
          student_id: anaId,
          exercise_id: squat,
          exercise_name: "Sentadilla",
          position,
          set_number: setNumber,
          weight_kg: weight,
          reps,
          is_warmup: warm,
        })),
      );
    }
  });
  afterAll(() => resetUsers(admin));

  it("el alumno exporta lo suyo en orden cronológico y por serie", async () => {
    const result = await getHistoryExport(anaDb, anaId);
    if (!result.ok) throw new Error("debía exportar");
    expect(result.studentName).toBe("Ana");
    expect(result.rows.map((r) => [r.date, r.setNumber, r.weightKg, r.isWarmup])).toEqual([
      ["2026-10-01", 1, 60, false],
      ["2026-10-03", 1, 40, true],
      ["2026-10-03", 2, 62.5, false],
    ]);
    expect(result.rows[0]).toMatchObject({
      sessionLabel: "A",
      exerciseName: "Sentadilla",
      reps: 10,
    });
  });

  it("el coach exporta el de su alumno", async () => {
    const result = await getHistoryExport(coachDb, anaId);
    expect(result.ok && result.rows.length).toBe(3);
  });

  it("otro alumno recibe 'no encontrado' sin saber que Ana existe", async () => {
    expect(await getHistoryExport(beaDb, anaId)).toEqual({ ok: false, reason: "not_found" });
  });

  it("un alumno sin entrenamientos exporta solo el encabezado (lista vacía)", async () => {
    const result = await getHistoryExport(beaDb, beaId);
    expect(result).toMatchObject({ ok: true, studentName: "Bea", rows: [] });
  });

  it("un id que no existe es 'no encontrado'", async () => {
    expect(await getHistoryExport(coachDb, crypto.randomUUID())).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
