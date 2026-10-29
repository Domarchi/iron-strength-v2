import { describe, expect, it } from "vitest";
import { recordingFixture } from "../../test/fixtures/workout-recording";
import {
  recordingPayloadSchema,
  recordingRequestSchema,
  recordingSaveSchema,
  workoutStructureSchema,
} from "./recording-contracts";
import {
  personalWorkoutRequestSchema,
  personalWorkoutPayloadSchema,
} from "./personal-workout-contracts";
import { workoutPayloadSchema } from "../workout/payload";
function change(root: unknown, path: (string | number)[], value: unknown) {
  const copy = structuredClone(root) as Record<string, unknown>;
  let row = copy;
  for (const key of path.slice(0, -1)) row = row[key] as Record<string, unknown>;
  row[path.at(-1)!] = value;
  return copy;
}
describe("cierre versionado con estructura", () => {
  it.each(["assigned", "personal", "free"] as const)(
    "conserva cuerpo y estructura de %s sin reinterpretarlos",
    (source) => {
      const value = recordingFixture(source),
        original = structuredClone(value);
      expect(recordingPayloadSchema.parse(value)).toEqual(value);
      expect(recordingRequestSchema.parse({ version: 2, payload: value })).toEqual({
        version: 2,
        payload: value,
      });
      expect(value).toEqual(original);
    },
  );
  it("los parsers anteriores rechazan el documento nuevo, sin quitar estructura y aceptar otro cuerpo", () => {
    const value = recordingFixture();
    expect(personalWorkoutRequestSchema.safeParse({ version: 2, payload: value }).success).toBe(
      false,
    );
    expect(personalWorkoutPayloadSchema.safeParse(value).success).toBe(false);
    expect(workoutPayloadSchema.safeParse(value).success).toBe(false);
  });
  it("versión, ID, origen y campos desconocidos fallan de forma cerrada", () => {
    const value = recordingFixture();
    for (const [path, next] of [
      [["version"], 3],
      [["source"], "assigned"],
      [["id"], value.structure.exercises[0].id],
      [["ownerId"], value.id],
      [["structure", "version"], 2],
      [["structure", "exercises", 0, "name"], "Nombre enviado"],
      [["workout", "admin"], true],
    ] as [(string | number)[], unknown][])
      expect(
        recordingPayloadSchema.safeParse(change(value, path, next)).success,
        path.join("."),
      ).toBe(false);
    expect(
      recordingSaveSchema.safeParse({
        version: 1,
        ok: true,
        status: "created",
        workoutId: value.id,
      }).success,
    ).toBe(false);
    expect(
      recordingSaveSchema.parse({ version: 2, ok: true, status: "duplicate", workoutId: value.id }),
    ).toMatchObject({ version: 2 });
  });
  it("cada serie corresponde a su fila real y a la identidad prescrita de las asignadas", () => {
    const free = recordingFixture(),
      assigned = recordingFixture("assigned");
    for (const value of [
      change(free, ["workout", "sets", 0, "position"], 2),
      change(free, ["workout", "sets", 0, "exerciseId"], free.id),
      change(free, ["structure", "exercises", 0, "prescribedExerciseId"], free.id),
      change(assigned, ["workout", "sets", 0, "sessionExerciseId"], assigned.id),
      change(assigned, ["structure", "exercises", 0, "prescribedExerciseId"], assigned.id),
    ])
      expect(recordingPayloadSchema.safeParse(value).success).toBe(false);
  });
  it("estructura no admite IDs repetidos, grupos solitarios o descansos distintos", () => {
    const value = recordingFixture();
    for (const changed of [
      change(value.structure, ["exercises", 1, "id"], value.structure.exercises[0].id),
      change(value.structure, ["exercises", 1, "supersetId"], value.id),
      change(value.structure, ["exercises", 1, "supersetRestSeconds"], 75),
      change(value.structure, ["exercises", 0, "restSeconds"], 14),
    ])
      expect(workoutStructureSchema.safeParse(changed).success).toBe(false);
  });
  it("valida prescripciones coherentes, cifras JSON reales y límites sin truncar", () => {
    const value = recordingFixture();
    for (const [path, next] of [
      [["structure", "exercises", 0, "prescribed", "sets"], 11],
      [["structure", "exercises", 0, "prescribed", "targetWeightKg"], 500.01],
      [["structure", "exercises", 0, "prescribed", "repsMin"], "8"],
      [["structure", "exercises", 0, "prescribed", "repsMin"], 13],
      [["structure", "exercises", 0, "prescribed", "targetWeightKg"], 30.001],
      [["structure", "exercises", 0, "id"], "af214000-0000-0000-0000-000000000100"],
      [["structure", "exercises", 0, "note"], "💪".repeat(501)],
      [["structure", "exercises", 0, "note"], "x".repeat(501)],
      [
        ["structure", "exercises", 0, "prescribed", "series"],
        [{ repsMin: 8, repsMax: 12, targetWeightKg: 30 }],
      ],
    ] as [(string | number)[], unknown][])
      expect(
        recordingPayloadSchema.safeParse(change(value, path, next)).success,
        `${path.join(".")}: ${String(next).slice(0, 40)}`,
      ).toBe(false);
  });
  it("el límite de nota cuenta caracteres Unicode, también fuera del plano básico", () => {
    const value = recordingFixture();
    expect(
      recordingPayloadSchema.parse(
        change(value, ["structure", "exercises", 0, "note"], "💪".repeat(500)),
      ).structure.exercises[0].note,
    ).toBe("💪".repeat(500));
  });
  it("veinte series reales con calentamientos conviven con dos objetivos prescritos", () => {
    const value = recordingFixture();
    const rows = Array.from({ length: 20 }, (_, index) => ({
      ...value.workout.sets[0],
      setNumber: index + 1,
      isWarmup: index === 0,
    }));
    const parsed = recordingPayloadSchema.parse(change(value, ["workout", "sets"], rows));
    expect(parsed.workout.sets).toEqual(rows);
    expect(
      recordingPayloadSchema.safeParse(
        change(value, ["workout", "sets"], [...rows, { ...rows[0], setNumber: 21 }]),
      ).success,
    ).toBe(false);
  });
});
