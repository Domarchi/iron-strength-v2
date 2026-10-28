import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { addDays, santiagoDate } from "@/domain/dates";
import { correctOwnWorkout, readOwnWorkoutCorrection } from "./workout-corrections";
import { readOwnWorkoutRemoval, removeOwnWorkout } from "./workout-removals";
import { correctionFormFromSnapshot, correctionFromForm } from "../workout/correction-form";

const admin = adminClient();

describe("editar y borrar entrenamientos (RF-26b)", () => {
  let studentId: string;
  let otherId: string;
  let studentDb: AdminClient;
  let otherDb: AdminClient;
  let coachDb: AdminClient;
  let exerciseId: string;

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
    exerciseId = (
      await admin
        .from("exercises")
        .select("id")
        .eq("name", "Sentadilla")
        .is("coach_id", null)
        .single()
    ).data!.id;
  });
  afterAll(() => resetUsers(admin));
  beforeEach(async () => {
    await admin.from("workouts").delete().in("student_id", [studentId, otherId]);
  });

  const today = santiagoDate(new Date());
  // Mediodía en Santiago de hace N días (evita ambigüedad cerca de la medianoche)
  const daysAgo = (n: number) => {
    const date = addDays(today, -n);
    return new Date(`${date}T15:00:00Z`).toISOString();
  };

  async function workout(ago: number, student = studentId) {
    const id = crypto.randomUUID();
    const startedAt = daysAgo(ago);
    await admin.from("workouts").insert({
      id,
      student_id: student,
      started_at: startedAt,
      finished_at: new Date(Date.parse(startedAt) + 3600_000).toISOString(),
      duration_seconds: 3600,
      created_at: startedAt,
    });
    const { data } = await admin
      .from("workout_sets")
      .insert([
        {
          workout_id: id,
          student_id: student,
          exercise_id: exerciseId,
          exercise_name: "Sentadilla",
          position: 0,
          set_number: 1,
          weight_kg: 60,
          reps: 10,
          is_warmup: false,
        },
        {
          workout_id: id,
          student_id: student,
          exercise_id: exerciseId,
          exercise_name: "Sentadilla",
          position: 0,
          set_number: 2,
          weight_kg: 60,
          reps: 8,
          is_warmup: false,
        },
      ])
      .select("id, set_number");
    return { id, setIds: data!.sort((a, b) => a.set_number - b.set_number).map((s) => s.id) };
  }

  async function editing(db: AdminClient, id: string) {
    const auth = await db.auth.getUser();
    if (!auth.data.user) throw Error("auth fixture");
    const base = await readOwnWorkoutCorrection(db, id, auth.data.user.id);
    if (!base) throw Error("missing fixture");
    const form = correctionFormFromSnapshot(base);
    return {
      base,
      form,
      submit: () => correctOwnWorkout(db, correctionFromForm(base, form, crypto.randomUUID())),
    };
  }
  async function removing(db: AdminClient, id: string) {
    const auth = await db.auth.getUser();
    if (!auth.data.user) throw Error("auth fixture");
    const base = await readOwnWorkoutRemoval(db, id, auth.data.user.id);
    if (!base) throw Error("missing fixture");
    return removeOwnWorkout(db, {
      version: 1,
      requestId: crypto.randomUUID(),
      workoutId: id,
      expectedRevision: base.workout.revision,
    });
  }
  it("edita peso, repeticiones y calentamiento legados en una operación completa", async () => {
    const w = await workout(2),
      e = await editing(studentDb, w.id);
    Object.assign(e.form.sets[0], { weightKg: "62,5", reps: "9", isWarmup: false });
    Object.assign(e.form.sets[1], { weightKg: "40", reps: "12", isWarmup: true });
    expect((await e.submit()).status).toBe("updated");
    const rows = await admin
      .from("workout_sets")
      .select("weight_kg,reps,is_warmup")
      .eq("workout_id", w.id)
      .order("set_number");
    expect(rows.data).toEqual([
      { weight_kg: 62.5, reps: 9, is_warmup: false },
      { weight_kg: 40, reps: 12, is_warmup: true },
    ]);
  });
  it("el día7 se edita; el día8 se rechaza en SQL con datos intactos", async () => {
    const edge = await workout(7),
      late = await workout(8);
    const a = await editing(studentDb, edge.id);
    a.form.sets[0].weightKg = "99";
    expect((await a.submit()).status).toBe("updated");
    const b = await editing(studentDb, late.id);
    b.form.sets[0].weightKg = "99";
    await expect(b.submit()).rejects.toMatchObject({ code: "55000" });
    expect(
      (await admin.from("workout_sets").select("weight_kg").eq("id", late.setIds[0]).single()).data
        ?.weight_kg,
    ).toBe(60);
  });
  it("retirar series conserva al menos una y no cambia el formato legado", async () => {
    const w = await workout(1),
      e = await editing(studentDb, w.id);
    e.form.sets[1].removed = true;
    await e.submit();
    const remaining = await editing(studentDb, w.id);
    expect(remaining.base.workout.sets).toHaveLength(1);
    expect(remaining.base.workout.structure).toBeNull();
    remaining.form.sets[0].removed = true;
    expect(() => correctionFromForm(remaining.base, remaining.form, crypto.randomUUID())).toThrow();
    expect(
      (await admin.from("workout_sets").select("id").eq("workout_id", w.id)).data,
    ).toHaveLength(1);
  });
  it("los límites del formulario legado no cambian datos ante valores inválidos", async () => {
    const w = await workout(1),
      e = await editing(studentDb, w.id);
    for (const bad of [
      { weightKg: "501", reps: "5" },
      { weightKg: "60", reps: "0" },
      { weightKg: "60", reps: "101" },
      { weightKg: "-1", reps: "5" },
    ]) {
      Object.assign(e.form.sets[0], bad);
      expect(() => correctionFromForm(e.base, e.form, crypto.randomUUID())).toThrow();
    }
    expect(
      (await admin.from("workout_sets").select("weight_kg,reps").eq("id", w.setIds[0]).single())
        .data,
    ).toEqual({ weight_kg: 60, reps: 10 });
  });
  it("no permite series ajenas, ni edición del alumno por coach u otro alumno", async () => {
    const mine = await workout(1),
      theirs = await workout(1, otherId),
      e = await editing(studentDb, mine.id);
    e.form.sets[0].weightKg = "1";
    const input = correctionFromForm(e.base, e.form, crypto.randomUUID());
    input.sets[0].id = theirs.setIds[0];
    await expect(correctOwnWorkout(studentDb, input)).rejects.toMatchObject({ code: "22023" });
    expect(await readOwnWorkoutCorrection(studentDb, theirs.id, studentId)).toBeNull();
    expect(await readOwnWorkoutCorrection(otherDb, mine.id, otherId)).toBeNull();
    await expect(
      correctOwnWorkout(otherDb, correctionFromForm(e.base, e.form, crypto.randomUUID())),
    ).rejects.toMatchObject({ code: "P0002" });
    const coach = await coachDb.auth.getUser();
    expect(await readOwnWorkoutCorrection(coachDb, mine.id, coach.data.user!.id)).toBeNull();
    const untouched = await admin
      .from("workout_sets")
      .select("weight_kg")
      .in("workout_id", [mine.id, theirs.id]);
    expect(untouched.data?.every((r) => r.weight_kg === 60)).toBe(true);
  });
  it("elimina un legado dentro de ventana con sus series y recibo privado", async () => {
    const w = await workout(3),
      receipt = await removing(studentDb, w.id);
    expect(receipt.status).toBe("deleted");
    expect((await admin.from("workout_sets").select("id").eq("workout_id", w.id)).data).toEqual([]);
    expect(
      (await admin.from("workout_correction_receipts").select("request_id").eq("workout_id", w.id))
        .data,
    ).toHaveLength(1);
  });
  it("no borra fuera del plazo ni resultados ajenos o inexistentes", async () => {
    const late = await workout(8),
      theirs = await workout(1, otherId);
    await expect(removing(studentDb, late.id)).rejects.toMatchObject({ code: "55000" });
    expect(await readOwnWorkoutRemoval(studentDb, theirs.id, studentId)).toBeNull();
    for (const wid of [theirs.id, crypto.randomUUID()])
      await expect(
        removeOwnWorkout(studentDb, {
          version: 1,
          requestId: crypto.randomUUID(),
          workoutId: wid,
          expectedRevision: 0,
        }),
      ).rejects.toMatchObject({ code: "P0002" });
    expect(
      (await admin.from("workouts").select("id").in("id", [late.id, theirs.id])).data,
    ).toHaveLength(2);
  });
});
