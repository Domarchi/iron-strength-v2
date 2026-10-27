import { describe, expect, it } from "vitest";
import {
  typedRecordingPayloadSchema,
  typedRecordingRequestSchema,
} from "./typed-recording-contracts";
import { recordingRequestSchema } from "./recording-contracts";
import { typedRecordingFixture as fixture } from "../../test/fixtures/typed-recording";
describe("cierre3 separado de los documentos anteriores", () => {
  it("mantiene las identidades asignadas y no transforma una base personal en libre", () => {
    const assigned = fixture("assigned");
    if (assigned.source !== "assigned") throw Error("fixture");
    assigned.workout.sets[0].prescribedExerciseId = assigned.structure.exercises[1].exerciseId;
    expect(typedRecordingPayloadSchema.safeParse(assigned).success).toBe(false);
    const personal = fixture("personal");
    expect(typedRecordingPayloadSchema.safeParse({ ...personal, source: "free" }).success).toBe(
      false,
    );
    const free = fixture();
    free.structure.exercises[0].prescribedExerciseId = free.structure.exercises[0].exerciseId;
    expect(typedRecordingPayloadSchema.safeParse(free).success).toBe(false);
  });
  for (const source of ["assigned", "personal", "free"] as const)
    it(`conserva origen ${source}, notas y métricas sin conversión al contrato2`, () => {
      const input = fixture(source),
        before = structuredClone(input);
      expect(typedRecordingPayloadSchema.parse(input)).toEqual(before);
      expect(typedRecordingRequestSchema.parse({ version: 3, payload: input }).payload).toEqual(
        before,
      );
      expect(recordingRequestSchema.safeParse({ version: 2, payload: input }).success).toBe(false);
      expect(typedRecordingRequestSchema.safeParse({ version: 4, payload: input }).success).toBe(
        false,
      );
    });
  it("guarda duración/distancia, objetivos y esfuerzo sin repeticiones ficticias", () => {
    const input = fixture();
    const target = {
      repsMin: null,
      repsMax: null,
      targetWeightKg: null,
      targetDurationSeconds: 300,
      targetDistanceMeters: 1000,
    };
    input.structure.exercises[0].prescribed = {
      recordType: "distance_duration",
      sets: 2,
      target,
      series: [target, target],
    };
    input.workout.sets[0].metrics = {
      recordType: "distance_duration",
      weightKg: null,
      reps: null,
      durationSeconds: 305,
      distanceMeters: 1000.25,
    };
    input.workout.sets[0].effort = 8.5;
    input.workout.exerciseNotes[1].note = "Sin series pero con nota propia";
    expect(typedRecordingPayloadSchema.parse(input).workout.sets[0].metrics.reps).toBeNull();
  });
  it("rechaza duplicados, referencias huérfanas, tipo distinto, campos futuros y mezcla de identidades", () => {
    const changes = [
      (x: ReturnType<typeof fixture>) => {
        x.id = x.structure.exercises[0].id;
      },
      (x: ReturnType<typeof fixture>) => {
        x.workout.exerciseNotes.reverse();
      },
      (x: ReturnType<typeof fixture>) => {
        if (x.source === "assigned") x.workout.sets.push(x.workout.sets[0]);
        else x.workout.sets.push(x.workout.sets[0]);
      },
      (x: ReturnType<typeof fixture>) => {
        x.structure.exercises[1].id = x.structure.exercises[0].id;
      },
      (x: ReturnType<typeof fixture>) => {
        x.workout.sets[0].exerciseId = x.structure.exercises[1].exerciseId;
      },
      (x: ReturnType<typeof fixture>) => {
        x.workout.sets[0].metrics.recordType = "weight_reps";
      },
      (x: ReturnType<typeof fixture>) => {
        x.workout.exerciseNotes.pop();
      },
      (x: ReturnType<typeof fixture>) => {
        Object.assign(x, { future: true });
      },
      (x: ReturnType<typeof fixture>) => {
        Object.assign(x.workout.sets[0], { isWarmup: true });
      },
      (x: ReturnType<typeof fixture>) => {
        x.workout.finishedAt = "2020-01-01T00:00:00Z";
      },
    ];
    for (const change of changes) {
      const input = fixture();
      change(input);
      expect(typedRecordingPayloadSchema.safeParse(input).success).toBe(false);
    }
  });
  it("no intercambia notas del coach, nota global y nota propia ni pierde Unicode", () => {
    const input = fixture();
    input.workout.exerciseNotes[0].note = "💪".repeat(500);
    const value = typedRecordingPayloadSchema.parse(input);
    expect(value.structure.exercises[0].note).toBe("Controlado");
    expect(value.workout.exerciseNotes[0].note).toHaveLength(1000);
    input.workout.exerciseNotes[0].note = "💪".repeat(501);
    expect(typedRecordingPayloadSchema.safeParse(input).success).toBe(false);
    const missing = fixture();
    expect(
      typedRecordingPayloadSchema.safeParse({
        ...missing,
        workout: {
          ...missing.workout,
          exerciseNotes: [
            { sessionExerciseId: missing.structure.exercises[0].id },
            missing.workout.exerciseNotes[1],
          ],
        },
      }).success,
    ).toBe(false);
  });
});
