import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { trainingHistoryFixture } from "@/test/fixtures/training-history";
import { trainingHistorySourceSchema } from "@/domain/training-history";
import { TrainingHistoryReadError } from "./training-history";
const read = vi.hoisted(() => vi.fn());
vi.mock("./training-history", async (importOriginal) => {
  const original = await importOriginal<typeof import("./training-history")>();
  return { ...original, readVisibleTrainingHistory: read };
});
import { getVisibleTrainingProgress, getTrainingWorkoutRecordCount } from "./training-review";
const db = {} as SupabaseClient<Database>;
beforeEach(() => {
  read.mockReset();
});
it("proyecta una sola fuente visible del alumno manteniendo los tipos separados", async () => {
  const source = trainingHistorySourceSchema.parse(trainingHistoryFixture());
  read.mockResolvedValue(source);
  const result = await getVisibleTrainingProgress(db, source.student.id);
  expect(read).toHaveBeenCalledExactlyOnceWith(db, source.student.id);
  expect(result).toMatchObject({ student: source.student, today: source.today });
  expect(result!.progress.activity[0].totals).toEqual({
    workingSets: 8,
    externalVolumeKg: 320,
    bodyweightReps: 24,
    durationSeconds: 420,
    distanceMeters: 1030.5,
  });
  expect(
    result!.progress.exercises.find((e) => e.recordType === "duration")!.marks.map((m) => m.metric),
  ).toEqual(["durationSeconds"]);
  expect(
    result!.progress.exercises
      .find((e) => e.recordType === "assisted_bodyweight")!
      .marks.map((m) => m.metric),
  ).toEqual(["reps", "assistanceKg"]);
});
it("un perfil invisible no se convierte en otro alumno", async () => {
  read.mockResolvedValue(null);
  const id = crypto.randomUUID();
  expect(await getVisibleTrainingProgress(db, id)).toBeNull();
  expect(await getTrainingWorkoutRecordCount(db, id, crypto.randomUUID())).toBe(0);
});
it("un fallo de capacidad no se convierte en progreso vacío o cero récords", async () => {
  const error = new TrainingHistoryReadError("capacity");
  read.mockRejectedValue(error);
  const id = crypto.randomUUID();
  await expect(getVisibleTrainingProgress(db, id)).rejects.toBe(error);
  await expect(getTrainingWorkoutRecordCount(db, id, crypto.randomUUID())).rejects.toBe(error);
});
