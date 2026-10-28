import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultPrescriptionInput, parsePrescriptionInput } from "@/domain/prescription-input";
import { readStoredTrainingPrescription } from "@/domain/stored-prescription";
import { RECORD_TYPES } from "@/domain/training-metrics";
import { mondayOf, santiagoDate } from "@/domain/dates";
import {
  adminClient,
  anonClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getProgramTree } from "./programs";
import { getWorkoutContext } from "./workout-context";
import { trainingMetricCases } from "@/test/fixtures/training-metrics";
import { typedRecordingPayloadSchema } from "@/lib/mobile/typed-recording-contracts";
import { saveTypedWorkoutRecording } from "./typed-recordings";

const admin = adminClient();
const cases = [null, ...RECORD_TYPES].map((kind) => ({
  kind,
  id: randomUUID(),
  rowId: randomUUID(),
  prescribed: parsePrescriptionInput(defaultPrescriptionInput(kind)),
}));
describe("T219 · modelo del coach y copias con la identidad real", () => {
  let coach: AdminClient;
  let student: AdminClient;
  let other: AdminClient;
  let third: AdminClient;
  let coachId: string;
  let studentId: string;
  const programId = randomUUID();
  const sessionId = randomUUID();
  let assignedId: string;
  let assignedSession: string;
  const copyId = randomUUID();

  beforeAll(async () => {
    await resetUsers(admin);
    const c = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "typed-coach@test.local",
    });
    const a = await createProfileUser(admin, {
      role: "student",
      name: "Alumno",
      email: "typed-a@test.local",
      coachId: c.id,
    });
    const b = await createProfileUser(admin, {
      role: "student",
      name: "Alumno",
      email: "typed-b@test.local",
      coachId: c.id,
    });
    const d = await createProfileUser(admin, {
      role: "student",
      name: "Alumno",
      email: "typed-c@test.local",
      coachId: c.id,
    });
    coachId = c.id;
    studentId = a.id;
    coach = await signedInClient(c.email, c.password);
    student = await signedInClient(a.email, a.password);
    other = await signedInClient(b.email, b.password);
    third = await signedInClient(d.email, d.password);
    expect(
      (
        await coach.from("exercises").insert(
          cases.map((entry, index) => ({
            id: entry.id,
            coach_id: coachId,
            name: `Tipo ${index}`,
            muscle_group: "Core",
            record_type: entry.kind,
          })),
        )
      ).error,
    ).toBeNull();
    expect(
      (
        await coach
          .from("programs")
          .insert({ id: programId, coach_id: coachId, name: "Objetivos mixtos", weeks_count: 2 })
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
        await coach.from("session_exercises").insert(
          cases.map((entry, position) => ({
            id: entry.rowId,
            program_session_id: sessionId,
            exercise_id: entry.id,
            position,
            sets: entry.prescribed.sets,
            reps_min: null,
            reps_max: null,
            typed_prescription: entry.prescribed,
            target_weight_kg: null,
            prescription_sets: null,
          })),
        )
      ).error,
    ).toBeNull();
    expect(
      (
        await coach.from("session_exercise_alternatives").insert({
          session_exercise_id: cases[0].rowId,
          exercise_id: cases[5].id,
          position: 0,
          sets: cases[5].prescribed.sets,
          reps_min: null,
          reps_max: null,
          typed_prescription: cases[5].prescribed,
        })
      ).error,
    ).toBeNull();
    const assigned = await coach.rpc("assign_program", {
      p_template_id: programId,
      p_student_id: studentId,
      p_start_date: mondayOf(santiagoDate(new Date())),
    });
    expect(assigned.error).toBeNull();
    assignedId = assigned.data!;
    const session = await student
      .from("program_sessions")
      .select("id")
      .eq("program_id", assignedId)
      .single();
    expect(session.error).toBeNull();
    assignedSession = session.data!.id;
  });
  afterAll(async () => {
    // Shared coach exercises are referenced by assigned programs. Remove this
    // fixture graph before deleting its coach, who is not deletable in the app.
    await admin.from("programs").delete().eq("coach_id", coachId);
    await resetUsers(admin);
  });

  it.each(cases)("conserva $kind con lectura autenticada y sin reps ficticias", async (entry) => {
    const result = await coach.from("session_exercises").select("*").eq("id", entry.rowId).single();
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      reps_min: null,
      reps_max: null,
      target_weight_kg: null,
      prescription_sets: null,
    });
    expect(readStoredTrainingPrescription(result.data!)).toEqual(entry.prescribed);
  });
  it("el lector anterior del editor rechaza explícitamente objetivos que no representa", async () => {
    await expect(getProgramTree(coach, programId)).rejects.toThrow(
      "formato de entrenamiento actualizado",
    );
  });
  it("el contexto anterior no degrada una rutina asignada moderna a repeticiones", async () => {
    await expect(getWorkoutContext(student, studentId, assignedSession)).rejects.toThrow(
      "formato de entrenamiento actualizado",
    );
  });
  it("la copia completa conserva objetivos e identifica el mismo intento", async () => {
    const args = { p_source_id: programId, p_copy_id: copyId, p_name: "Copia independiente" };
    expect((await coach.rpc("duplicate_program", args)).data).toBe(copyId);
    expect((await coach.rpc("duplicate_program", args)).data).toBe(copyId);
    const copied = await coach
      .from("program_sessions")
      .select("session_exercises(*)")
      .eq("program_id", copyId)
      .single();
    expect(copied.error).toBeNull();
    expect(copied.data!.session_exercises).toHaveLength(cases.length);
    for (const entry of cases) {
      const row = copied.data!.session_exercises.find((item) => item.exercise_id === entry.id)!;
      expect(row.id).not.toBe(entry.rowId);
      expect(readStoredTrainingPrescription(row)).toEqual(entry.prescribed);
    }
  });
  it("asignar conserva los nueve contratos y los alumnos ajenos no los leen", async () => {
    const own = await student
      .from("session_exercises")
      .select("*")
      .eq("program_session_id", assignedSession);
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(cases.length);
    for (const db of [other, third]) {
      const hidden = await db
        .from("session_exercises")
        .select("id")
        .eq("program_session_id", assignedSession);
      expect(hidden.error).toBeNull();
      expect(hidden.data).toEqual([]);
    }
    const anonymous = await anonClient()
      .from("session_exercises")
      .select("id")
      .eq("program_session_id", assignedSession);
    expect(anonymous.error?.code).toBe("42501");
  });
  it("bloquea el DML y los atajos de calendario en la semana vigente", async () => {
    const current = await coach
      .from("session_exercises")
      .update({ note: "Cambio actual" })
      .eq("program_session_id", assignedSession);
    expect(current.error?.code).toBe("55000");
    const unlock = await coach
      .from("programs")
      .update({ student_id: null, start_date: null, ends_on: null })
      .eq("id", assignedId);
    expect(unlock.error?.code).toBe("55000");
    const remove = await coach.from("program_sessions").delete().eq("id", assignedSession);
    expect(remove.error?.code).toBe("55000");
    const rows = await student
      .from("session_exercises")
      .select("id")
      .eq("program_session_id", assignedSession);
    expect(rows.data).toHaveLength(cases.length);
  });
  it("el coach también puede recibir su programa tipado", async () => {
    const assigned = await coach.rpc("assign_program", {
      p_template_id: programId,
      p_student_id: coachId,
      p_start_date: mondayOf(santiagoDate(new Date())),
    });
    expect(assigned.error).toBeNull();
    const own = await coach
      .from("program_sessions")
      .select("session_exercises(typed_prescription)")
      .eq("program_id", assigned.data!)
      .single();
    expect(own.error).toBeNull();
    expect(own.data!.session_exercises).toHaveLength(cases.length);
  });
  it("cierra todos los tipos asignados y una alternativa sin degradar sus objetivos", async () => {
    const rows = await student
      .from("session_exercises")
      .select("*")
      .eq("program_session_id", assignedSession)
      .order("position");
    expect(rows.error).toBeNull();
    const id = randomUUID();
    const day = santiagoDate(new Date());
    const payload = typedRecordingPayloadSchema.parse({
      version: 3,
      id,
      source: "assigned",
      structure: {
        version: 2,
        exercises: rows.data!.map((row, position) => ({
          id: row.id,
          exerciseId: position === 0 ? cases[5].id : row.exercise_id,
          prescribedExerciseId: row.exercise_id,
          prescribed: position === 0 ? cases[5].prescribed : readStoredTrainingPrescription(row),
          note: row.note,
          restSeconds: row.rest_seconds,
          supersetId: row.superset_id,
          supersetRestSeconds: row.superset_rest_seconds,
        })),
      },
      workout: {
        version: 2,
        id,
        programId: assignedId,
        programSessionId: assignedSession,
        sessionLabel: "A",
        startedAt: `${day}T12:00:00Z`,
        finishedAt: `${day}T12:30:00Z`,
        durationSeconds: 1800,
        exerciseNotes: rows.data!.map((row) => ({ sessionExerciseId: row.id, note: null })),
        sets: rows.data!.map((row, position) => ({
          sessionExerciseId: row.id,
          prescribedExerciseId: row.exercise_id,
          exerciseId: position === 0 ? cases[5].id : row.exercise_id,
          exerciseName: "Ejercicio",
          position,
          setNumber: 1,
          metrics: trainingMetricCases[position === 0 ? 5 : position],
          setType: "working",
          effort: null,
        })),
      },
    });
    const original = structuredClone(payload);
    original.id = randomUUID();
    original.workout.id = original.id;
    original.structure.exercises[0].exerciseId = cases[0].id;
    original.structure.exercises[0].prescribed = cases[0].prescribed;
    original.workout.sets[0].exerciseId = cases[0].id;
    original.workout.sets[0].metrics = { ...trainingMetricCases[0] };
    expect((await saveTypedWorkoutRecording(student, original)).status).toBe("created");
    expect((await saveTypedWorkoutRecording(student, payload)).status).toBe("created");
    expect((await saveTypedWorkoutRecording(student, payload)).status).toBe("duplicate");
    const changed = structuredClone(payload);
    changed.id = randomUUID();
    changed.workout.id = changed.id;
    changed.structure.exercises[0].prescribed.target.targetDurationSeconds = 99;
    await expect(saveTypedWorkoutRecording(student, changed)).rejects.toMatchObject({
      code: "40001",
    });
  });
  it("Auth borra al alumno y sus alternativas tipadas en cascada", async () => {
    expect((await admin.auth.admin.deleteUser(studentId)).error).toBeNull();
    const remaining = await coach.from("programs").select("id").eq("id", assignedId);
    expect(remaining.error).toBeNull();
    expect(remaining.data).toEqual([]);
  });
});
