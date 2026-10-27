import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "../../test/int/helpers";
import {
  trainingMetricsSchema,
  trainingPrescriptionSchema,
  trainingSetDetailsSchema,
  athleteNoteSchema,
} from "../../domain/training-metrics";
import { trainingMetricCases } from "../../test/fixtures/training-metrics";
import type { Json } from "../../types/database";
const admin = adminClient();
describe("paridad SQL y aplicación de los contratos de entrenamiento", () => {
  let clients: AdminClient[];
  beforeAll(async () => {
    await resetUsers(admin);
    clients = [];
    const coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@metrics.test.local",
    });
    clients.push(await signedInClient(coach.email, coach.password));
    for (let i = 0; i < 3; i++) {
      const p = await createProfileUser(admin, {
        role: "student",
        name: "Alumno",
        email: `student${i}@metrics.test.local`,
        coachId: coach.id,
      });
      clients.push(await signedInClient(p.email, p.password));
    }
  });
  afterAll(() => resetUsers(admin));
  it("cada cuenta autenticada valida sin acceso administrativo; anónimo no ejecuta", async () => {
    for (const db of clients) {
      const result = await db.rpc("valid_training_metrics", { p_metrics: trainingMetricCases[0] });
      expect(result.error).toBeNull();
      expect(result.data).toBe(true);
    }
    expect(
      (await anonClient().rpc("valid_training_metrics", { p_metrics: trainingMetricCases[0] }))
        .error?.code,
    ).toBe("42501");
  });
  it("dimensiones, límites, campos desconocidos y JSON no convierten ni recortan", async () => {
    const inputs: Json[] = [
      null,
      [],
      {},
      1,
      "30",
      { ...trainingMetricCases[0], extra: 1 },
      { ...trainingMetricCases[0], recordType: "future" },
    ];
    for (const row of trainingMetricCases) {
      inputs.push(row);
      for (const key of ["weightKg", "reps", "durationSeconds", "distanceMeters"] as const)
        inputs.push({ ...row, [key]: row[key] === null ? 1 : null });
    }
    for (const value of [-1, 0.001, 500.01, "30", true])
      inputs.push({ ...trainingMetricCases[0], weightKg: value });
    for (const input of inputs) {
      const result = await clients[1].rpc("valid_training_metrics", { p_metrics: input });
      expect(result.error).toBeNull();
      expect(result.data, JSON.stringify(input)).toBe(
        trainingMetricsSchema.safeParse(input).success,
      );
    }
  });
  it("objetivos y detalles conservan tipo, resumen, campos nulos y cantidad exacta", async () => {
    const inputs: Json[] = [null, [], {}, "30"];
    for (const row of trainingMetricCases) {
      const target = {
        repsMin: row.reps === null ? null : 8,
        repsMax: row.reps === null ? null : 12,
        targetWeightKg: row.weightKg,
        targetDurationSeconds: row.durationSeconds,
        targetDistanceMeters: row.distanceMeters,
      };
      const base = { recordType: row.recordType, sets: 2, target, series: null };
      inputs.push(
        base,
        { ...base, series: [target, target] },
        { ...base, sets: 11 },
        { ...base, series: [target] },
        { ...base, target: { ...target, repsMin: "8" } },
      );
      for (const key of Object.keys(target))
        inputs.push({ ...base, target: { ...target, [key]: null } });
    }
    for (const input of inputs) {
      const result = await clients[1].rpc("valid_training_prescription", { p_prescription: input });
      expect(result.error).toBeNull();
      expect(result.data, JSON.stringify(input)).toBe(
        trainingPrescriptionSchema.safeParse(input).success,
      );
    }
  });
  it("esfuerzo y notas Unicode coinciden y no se escriben en datos del usuario", async () => {
    for (const setType of ["working", "warmup", "failure", "drop", "future"])
      for (const effort of [null, 1, 5.5, 10, 0, 5.1, "8"]) {
        const input = { setType, effort },
          result = await clients[1].rpc("valid_training_set_details", { p_details: input });
        expect(result.error).toBeNull();
        expect(result.data).toBe(trainingSetDetailsSchema.safeParse(input).success);
      }
    for (const input of [null, "", "  Propia\n  ", "💪".repeat(500), "💪".repeat(501), 8, {}, []]) {
      const result = await clients[1].rpc("valid_training_note", { p_note: input });
      expect(result.error).toBeNull();
      expect(result.data).toBe(athleteNoteSchema.safeParse(input).success);
    }
    expect((await clients[1].from("workouts").select("id")).data).toEqual([]);
  });
});
