import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultPrescriptionInput, parsePrescriptionInput } from "@/domain/prescription-input";
import { RECORD_TYPES, trainingTargetSummary, type RecordType } from "@/domain/training-metrics";
import { addDays, mondayOf, santiagoDate } from "@/domain/dates";
import {
  adminClient,
  anonClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getCoachProgramTree, listCoachCatalog } from "./coach-programs";
import { assignProgram, getProgramTree } from "./programs";
import { getAssignmentPreview } from "./planning";

const admin = adminClient();
describe("T219 · lectura canónica de planificación", () => {
  let coach: AdminClient, coachId: string, programId: string, sessionId: string;
  const students: { db: AdminClient; id: string }[] = [];
  let inactive: AdminClient;
  const ids = [null, ...RECORD_TYPES].map(() => randomUUID());
  const rowIds: string[] = ids.map(() => randomUUID());
  const group = randomUUID(),
    ownPrivate = randomUUID(),
    studentPrivate = randomUUID(),
    archived = randomUUID();
  const kinds: RecordType[] = [null, ...RECORD_TYPES];
  beforeAll(async () => {
    await resetUsers(admin);
    const owner = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "typed-reader-coach@test.local",
    });
    coachId = owner.id;
    coach = await signedInClient(owner.email, owner.password);
    for (let i = 0; i < 3; i++) {
      const person = await createProfileUser(admin, {
        role: "student",
        name: "Alumno",
        email: `typed-reader-${i}@test.local`,
        coachId,
      });
      students.push({ id: person.id, db: await signedInClient(person.email, person.password) });
    }
    const deactivated = await createProfileUser(admin, {
      role: "student",
      name: "Inactivo",
      email: "typed-reader-inactive@test.local",
      coachId,
      isActive: false,
    });
    inactive = await signedInClient(deactivated.email, deactivated.password);
    expect(
      (
        await coach.from("exercises").insert(
          kinds.map((kind, i) => ({
            id: ids[i],
            coach_id: coachId,
            name: `Lectura ${i}`,
            muscle_group: "Core",
            equipment: i === 0 ? "Peso corporal" : "Otro",
            record_type: kind,
          })),
        )
      ).error,
    ).toBeNull();
    expect(
      (
        await coach.from("exercises").insert({
          id: archived,
          coach_id: coachId,
          name: "Lectura archivada",
          muscle_group: "Core",
          record_type: "duration",
          archived_at: new Date().toISOString(),
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await admin.from("exercises").insert([
          {
            id: ownPrivate,
            personal_owner_id: coachId,
            record_type: "duration",
            name: "Privado coach",
            muscle_group: "Core",
          },
          {
            id: studentPrivate,
            personal_owner_id: students[0].id,
            record_type: "duration",
            name: "Privado alumno",
            muscle_group: "Core",
          },
        ])
      ).error,
    ).toBeNull();
    programId = randomUUID();
    sessionId = randomUUID();
    expect(
      (
        await coach
          .from("programs")
          .insert({ id: programId, coach_id: coachId, name: "Base mixta", weeks_count: 4 })
      ).error,
    ).toBeNull();
    expect(
      (
        await coach.from("program_sessions").insert([
          {
            id: sessionId,
            program_id: programId,
            week_number: 1,
            label: "B",
            title: "Sesión mixta",
            weekday: 2,
          },
          { id: randomUUID(), program_id: programId, week_number: 1, label: "A" },
          { id: randomUUID(), program_id: programId, week_number: 4, label: "A" },
        ])
      ).error,
    ).toBeNull();
    const fixtureRows = kinds.map((kind, i) => {
      let prescribed = parsePrescriptionInput(defaultPrescriptionInput(kind));
      if (kind === "weight_duration") {
        const series = [
          { ...prescribed.target, targetWeightKg: 0, targetDurationSeconds: 30 },
          { ...prescribed.target, targetWeightKg: 12.35, targetDurationSeconds: 45 },
        ];
        prescribed = { ...prescribed, sets: 2, series, target: trainingTargetSummary(series) };
      }
      return {
        id: rowIds[i],
        program_session_id: sessionId,
        exercise_id: ids[i],
        position: kinds.length - i,
        sets: prescribed.sets,
        reps_min: i === 0 ? 8 : null,
        reps_max: i === 0 ? 12 : null,
        target_weight_kg: i === 0 ? 0 : null,
        typed_prescription: i === 0 ? null : prescribed,
        note: `Indicación ${i}`,
        rest_seconds: 90,
        superset_id: i < 2 ? group : null,
        superset_rest_seconds: i < 2 ? 120 : null,
      };
    });
    expect((await coach.from("session_exercises").insert(fixtureRows)).error).toBeNull();
    expect(
      (
        await coach.from("session_exercise_alternatives").insert(
          [2, 3, 4].map((i, position) => ({
            id: randomUUID(),
            session_exercise_id: rowIds[0],
            exercise_id: ids[i],
            position: 2 - position,
            sets: 3,
            reps_min: null,
            reps_max: null,
            typed_prescription: parsePrescriptionInput(defaultPrescriptionInput(kinds[i])),
          })),
        )
      ).error,
    ).toBeNull();
  });
  afterAll(async () => {
    await admin.from("programs").delete().eq("coach_id", coachId);
    await resetUsers(admin);
  });
  it("conserva los nueve contratos, sus dimensiones y el detalle completo sin columnas ficticias", async () => {
    const tree = await getCoachProgramTree(coach, programId);
    expect(tree).toMatchObject({
      id: programId,
      coachId,
      name: "Base mixta",
      weeksCount: 4,
      studentId: null,
    });
    expect(tree!.sessions.map((s) => [s.weekNumber, s.label])).toEqual([
      [1, "A"],
      [1, "B"],
      [4, "A"],
    ]);
    const session = tree!.sessions[1];
    expect(session).toMatchObject({ id: sessionId, title: "Sesión mixta", weekday: 2 });
    expect(session.revision).toBeGreaterThan(0);
    expect(session.exercises.map((r) => r.id)).toEqual([...rowIds].reverse());
    for (const [i, kind] of kinds.entries()) {
      const row = session.exercises.find((r) => r.id === rowIds[i])!;
      expect(row.recordType).toBe(kind);
      expect(row.prescribed.recordType).toBe(kind);
      expect(row.note).toBe(`Indicación ${i}`);
      expect(row.restSeconds).toBe(90);
      expect(row).not.toHaveProperty("repsMin");
      expect(row).not.toHaveProperty("sets");
    }
    const legacy = session.exercises.find((r) => r.id === rowIds[0])!;
    expect(legacy.prescribed.target).toMatchObject({
      repsMin: 8,
      repsMax: 12,
      targetWeightKg: 0,
      targetDurationSeconds: null,
    });
    const timed = session.exercises.find((r) => r.recordType === "weight_duration")!;
    expect(timed.prescribed.series).toEqual([
      {
        repsMin: null,
        repsMax: null,
        targetWeightKg: 0,
        targetDurationSeconds: 30,
        targetDistanceMeters: null,
      },
      {
        repsMin: null,
        repsMax: null,
        targetWeightKg: 12.35,
        targetDurationSeconds: 45,
        targetDistanceMeters: null,
      },
    ]);
    expect(legacy.supersetId).toBe(group);
    expect(legacy.supersetRestSeconds).toBe(120);
  });
  it("mantiene alternativas independientes ordenadas con identidad y tipo propios", async () => {
    const tree = await getCoachProgramTree(coach, programId);
    const alternatives = tree!.sessions[1].exercises.find((r) => r.id === rowIds[0])!.alternatives;
    expect(alternatives.map((a) => a.exerciseId)).toEqual([ids[4], ids[3], ids[2]]);
    expect(alternatives.map((a) => a.prescribed.recordType)).toEqual([
      kinds[4],
      kinds[3],
      kinds[2],
    ]);
    expect(new Set(alternatives.map((a) => a.id)).size).toBe(3);
  });
  it("no degrada el contrato nuevo al lector anterior", async () => {
    await expect(getProgramTree(coach, programId)).rejects.toThrow(
      "formato de entrenamiento actualizado",
    );
  });
  it("prepara la revisión real de asignación sin pasar por el lector antiguo", async () => {
    const startDate = addDays(mondayOf(santiagoDate(new Date())), 7);
    const preview = await getAssignmentPreview(coach, programId, students[0].id, startDate);
    expect(preview?.source).toMatchObject({ id: programId, name: "Base mixta", weeksCount: 4 });
    expect(preview?.source.sessions).toHaveLength(3);
    expect(preview?.existing).toEqual([]);
  });
  it("excluye ejercicios privados y archivados del catálogo asignable, conservando el tipo", async () => {
    const catalog = await listCoachCatalog(coach);
    expect(catalog.map((e) => e.id)).not.toContain(ownPrivate);
    expect(catalog.map((e) => e.id)).not.toContain(studentPrivate);
    expect(catalog.map((e) => e.id)).not.toContain(archived);
    for (const [i, kind] of kinds.entries())
      expect(catalog.find((e) => e.id === ids[i])?.recordType).toBe(kind);
  });
  it("respeta la RLS: plantilla ajena invisible y ausencia explícita", async () => {
    expect(await getCoachProgramTree(coach, randomUUID())).toBeNull();
    for (const db of [...students.map((s) => s.db), inactive])
      expect(await getCoachProgramTree(db, programId)).toBeNull();
    await expect(getCoachProgramTree(anonClient(), programId)).rejects.toThrow(
      "No se pudo cargar el programa",
    );
  });
  it("lee copias asignadas independientes para tres alumnos y el propio coach", async () => {
    const original = (await getCoachProgramTree(coach, programId))!;
    const sourceSession = original.sessions.find((s) => s.id === sessionId)!;
    const startDate = addDays(mondayOf(santiagoDate(new Date())), 7);
    for (const person of [...students, { id: coachId, db: coach }]) {
      const assignment = await assignProgram({
        db: coach,
        templateId: programId,
        studentId: person.id,
        startDate,
      });
      expect(assignment.ok).toBe(true);
      if (!assignment.ok) throw Error("assignment fixture");
      const tree = (await getCoachProgramTree(person.db, assignment.programId))!;
      expect(tree.studentId).toBe(person.id);
      expect(await getCoachProgramTree(coach, assignment.programId)).toEqual(tree);
      const copied = tree.sessions.find((s) => s.weekNumber === 1 && s.label === "B")!;
      expect(copied.id).not.toBe(sourceSession.id);
      expect(copied.exercises.map((r) => r.prescribed)).toEqual(
        sourceSession.exercises.map((r) => r.prescribed),
      );
      expect(copied.exercises.map((r) => r.id).some((id) => rowIds.includes(id))).toBe(false);
      expect(copied.exercises.find((r) => r.supersetId)?.supersetId).not.toBe(group);
      expect(copied.exercises.at(-1)!.alternatives.map((a) => a.prescribed)).toEqual(
        sourceSession.exercises.at(-1)!.alternatives.map((a) => a.prescribed),
      );
      for (const other of students.filter((s) => s.id !== person.id))
        expect(await getCoachProgramTree(other.db, tree.id)).toBeNull();
      expect(await getCoachProgramTree(inactive, tree.id)).toBeNull();
    }
    expect(await getCoachProgramTree(coach, programId)).toEqual(original);
  });
});
