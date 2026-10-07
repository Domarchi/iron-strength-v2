import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { estimated1RM } from "@/domain/records";
import {
  fetchStudentSets,
  getExerciseSeries,
  getWorkoutRecords,
  listExerciseProgress,
} from "./progress";

const admin = adminClient();

describe("progreso por ejercicio y récords (RF-28, RF-30, DC-7)", () => {
  let studentId: string;
  let otherId: string;
  let studentDb: AdminClient;
  let coachDb: AdminClient;
  let otherDb: AdminClient;
  let squatId: string;
  let benchId: string;
  let pullUpId: string;

  beforeAll(async () => {
    await resetUsers(admin);
    const coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@test.local",
    });
    const student = await createProfileUser(admin, {
      role: "student",
      name: "Alumno",
      email: "alumno@test.local",
      coachId: coach.id,
    });
    const other = await createProfileUser(admin, {
      role: "student",
      name: "Otro",
      email: "otro@test.local",
      coachId: coach.id,
    });
    studentId = student.id;
    otherId = other.id;
    coachDb = await signedInClient(coach.email, coach.password);
    studentDb = await signedInClient(student.email, student.password);
    otherDb = await signedInClient(other.email, other.password);
    const ids = await admin
      .from("exercises")
      .select("id, name")
      .in("name", ["Sentadilla", "Press de banca", "Dominadas"])
      .is("coach_id", null);
    squatId = ids.data!.find((e) => e.name === "Sentadilla")!.id;
    benchId = ids.data!.find((e) => e.name === "Press de banca")!.id;
    pullUpId = ids.data!.find((e) => e.name === "Dominadas")!.id;
  });
  afterAll(() => resetUsers(admin));
  beforeEach(async () => {
    await admin.from("workouts").delete().in("student_id", [studentId, otherId]);
  });

  type S = { exerciseId: string; name: string; weightKg: number; reps: number; isWarmup?: boolean };
  async function workout(startedAt: string, sets: S[], student = studentId) {
    const id = crypto.randomUUID();
    await admin.from("workouts").insert({
      id,
      student_id: student,
      started_at: startedAt,
      finished_at: new Date(Date.parse(startedAt) + 3600_000).toISOString(),
      duration_seconds: 3600,
    });
    const perExercise = new Map<string, number>();
    await admin.from("workout_sets").insert(
      sets.map((s, i) => {
        const n = (perExercise.get(s.exerciseId) ?? 0) + 1;
        perExercise.set(s.exerciseId, n);
        return {
          workout_id: id,
          student_id: student,
          exercise_id: s.exerciseId,
          exercise_name: s.name,
          position: [...perExercise.keys()].indexOf(s.exerciseId),
          set_number: n,
          weight_kg: s.weightKg,
          reps: s.reps,
          is_warmup: s.isWarmup ?? false,
          ...(i < 0 ? {} : {}),
        };
      }),
    );
    return id;
  }

  const squat = (weightKg: number, reps: number, isWarmup = false): S => ({
    exerciseId: squatId,
    name: "Sentadilla",
    weightKg,
    reps,
    isWarmup,
  });
  const bench = (weightKg: number, reps: number): S => ({
    exerciseId: benchId,
    name: "Press de banca",
    weightKg,
    reps,
  });

  describe("fetchStudentSets", () => {
    it("trae todas las series aunque superen el tamaño de página", async () => {
      await workout("2026-10-01T15:00:00Z", [
        squat(60, 10),
        squat(60, 9),
        squat(60, 8),
        squat(62.5, 6),
        squat(62.5, 5),
      ]);
      const rows = await fetchStudentSets(studentDb, studentId, { pageSize: 2 });
      expect(rows).toHaveLength(5);
      expect(new Set(rows.map((r) => r.id)).size).toBe(5); // sin repetir ni saltar
    });

    it("puede limitarse a ciertos ejercicios", async () => {
      await workout("2026-10-01T15:00:00Z", [squat(60, 10), bench(40, 10)]);
      const rows = await fetchStudentSets(studentDb, studentId, { exerciseIds: [benchId] });
      expect(rows.map((r) => r.exerciseId)).toEqual([benchId]);
    });
  });

  describe("listExerciseProgress (T80)", () => {
    it("resume cada ejercicio: mejores marcas, última fecha y cantidad de entrenamientos", async () => {
      await workout("2026-09-20T15:00:00Z", [squat(20, 10, true), squat(55, 10), squat(55, 9)]);
      await workout("2026-10-01T15:00:00Z", [squat(60, 8), squat(62.5, 5), bench(40, 10)]);

      const list = await listExerciseProgress(studentDb, studentId);
      expect(list.map((e) => e.name)).toEqual(["Press de banca", "Sentadilla"]); // por actividad reciente (ambos 10-01; el más reciente primero)
      const squatProgress = list.find((e) => e.exerciseId === squatId)!;
      expect(squatProgress).toMatchObject({
        bestWeightKg: 62.5,
        lastDate: "2026-10-01",
        workoutCount: 2,
        isBodyweight: false,
      });
      expect(squatProgress.bestEstimated1RM).toBeCloseTo(
        Math.max(estimated1RM(62.5, 5), estimated1RM(60, 8), estimated1RM(55, 10)),
        6,
      );
    });

    it("ignora el calentamiento y no lista ejercicios sin series de trabajo", async () => {
      await workout("2026-10-01T15:00:00Z", [squat(100, 3, true)]);
      expect(await listExerciseProgress(studentDb, studentId)).toEqual([]);
    });

    it("los ejercicios de peso corporal se resumen por repeticiones", async () => {
      await workout("2026-10-01T15:00:00Z", [
        { exerciseId: pullUpId, name: "Dominadas", weightKg: 0, reps: 8 },
        { exerciseId: pullUpId, name: "Dominadas", weightKg: 0, reps: 10 },
      ]);
      const [pullUp] = await listExerciseProgress(studentDb, studentId);
      expect(pullUp).toMatchObject({
        name: "Dominadas",
        isBodyweight: true,
        bestReps: 10,
        bestWeightKg: 0,
      });
    });

    it("no mezcla alumnos, y el coach ve los de su alumno", async () => {
      await workout("2026-10-01T15:00:00Z", [squat(60, 8)]);
      await workout("2026-10-02T15:00:00Z", [bench(40, 8)], otherId);
      expect((await listExerciseProgress(studentDb, studentId)).map((e) => e.name)).toEqual([
        "Sentadilla",
      ]);
      expect((await listExerciseProgress(coachDb, studentId)).map((e) => e.name)).toEqual([
        "Sentadilla",
      ]);
      expect(await listExerciseProgress(otherDb, studentId)).toEqual([]);
    });
  });

  describe("getExerciseSeries (T81)", () => {
    it("un punto por entrenamiento, ordenado por fecha, con 1RM y volumen", async () => {
      await workout("2026-10-05T15:00:00Z", [squat(62.5, 8), squat(62.5, 8)]);
      await workout("2026-10-01T15:00:00Z", [squat(20, 10, true), squat(60, 8), squat(60, 6)]);
      const series = await getExerciseSeries(studentDb, studentId, squatId);
      expect(series.map((p) => p.date)).toEqual(["2026-10-01", "2026-10-05"]);
      expect(series[0].volumeKg).toBe(60 * 8 + 60 * 6);
      expect(series[1].estimated1RM).toBeCloseTo(estimated1RM(62.5, 8), 6);
    });

    it("sin datos, serie vacía", async () => {
      expect(await getExerciseSeries(studentDb, studentId, squatId)).toEqual([]);
    });
  });

  describe("getWorkoutRecords (T82)", () => {
    it("el primer registro de un ejercicio no es récord", async () => {
      const id = await workout("2026-10-01T15:00:00Z", [squat(60, 8)]);
      expect(await getWorkoutRecords(studentDb, id)).toEqual([]);
    });

    it("detecta récords frente al historial anterior, con el nombre del ejercicio", async () => {
      await workout("2026-10-01T15:00:00Z", [squat(60, 8), bench(40, 10)]);
      const id = await workout("2026-10-06T15:00:00Z", [squat(65, 6), bench(40, 8)]);
      const records = await getWorkoutRecords(studentDb, id);
      expect(records.map((r) => [r.name, r.type])).toEqual([
        ["Sentadilla", "weight"],
        ["Sentadilla", "estimated1rm"],
      ]);
      expect(records[0]).toMatchObject({ value: 65, previous: 60 });
    });

    it("solo compara con entrenamientos anteriores a este, no con los posteriores", async () => {
      const early = await workout("2026-10-01T15:00:00Z", [squat(60, 8)]);
      await workout("2026-10-06T15:00:00Z", [squat(80, 8)]);
      expect(await getWorkoutRecords(studentDb, early)).toEqual([]);
    });

    it("un entrenamiento ajeno no se puede consultar", async () => {
      const id = await workout("2026-10-01T15:00:00Z", [squat(60, 8)]);
      expect(await getWorkoutRecords(otherDb, id)).toEqual([]);
    });
  });
});
