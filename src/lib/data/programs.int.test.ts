import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { mondayOf, santiagoDate, addDays } from "@/domain/dates";
import {
  addSession,
  addSessionExercise,
  assignProgram,
  copyWeek,
  createTemplate,
  deleteTemplate,
  getProgramTree,
  listAssignedPrograms,
  listTemplates,
  removeSession,
  removeSessionExercise,
  reorderSessionExercises,
  updateSessionExercise,
} from "./programs";

const admin = adminClient();

describe("programas (RF-12 a RF-18, DC-10, DC-13)", () => {
  let coachId: string;
  let studentId: string;
  let coachDb: AdminClient;
  let studentDb: AdminClient;
  let squatId: string;
  let benchId: string;
  let archivedId: string;

  const prescription = (exerciseId: string, over: Record<string, unknown> = {}) => ({
    exerciseId,
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    targetWeightKg: "",
    note: "",
    ...over,
  });

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
    coachId = coach.id;
    studentId = student.id;
    coachDb = await signedInClient(coach.email, coach.password);
    studentDb = await signedInClient(student.email, student.password);

    const { data: exercises } = await admin
      .from("exercises")
      .select("id, name")
      .in("name", ["Sentadilla", "Press de banca"])
      .is("coach_id", null);
    squatId = exercises!.find((e) => e.name === "Sentadilla")!.id;
    benchId = exercises!.find((e) => e.name === "Press de banca")!.id;
    const { data: archived } = await admin
      .from("exercises")
      .insert({
        coach_id: coach.id,
        name: "Archivado de prueba",
        muscle_group: "Core",
        archived_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    archivedId = archived!.id;
  });
  afterAll(() => resetUsers(admin));

  async function newTemplate(weeks = 4, name = `Plantilla ${Math.random()}`) {
    const result = await createTemplate({
      db: coachDb,
      coachId,
      input: { name, weeksCount: weeks },
    });
    if (!result.ok) throw new Error("no se pudo crear la plantilla");
    return result.id;
  }

  describe("plantillas (T60)", () => {
    it("crea una plantilla de 1 a 16 semanas y la lista con sus conteos", async () => {
      const id = await newTemplate(4, "Fuerza 4 semanas");
      const templates = await listTemplates(coachDb);
      const found = templates.find((t) => t.id === id);
      expect(found).toMatchObject({
        name: "Fuerza 4 semanas",
        weeksCount: 4,
        sessionCount: 0,
        studentId: null,
      });
    });

    it("rechaza 0 y 17 semanas, y nombres vacíos", async () => {
      for (const weeksCount of [0, 17]) {
        expect(
          await createTemplate({ db: coachDb, coachId, input: { name: "X", weeksCount } }),
        ).toEqual({
          ok: false,
          reason: "invalid",
        });
      }
      expect(
        await createTemplate({ db: coachDb, coachId, input: { name: "  ", weeksCount: 4 } }),
      ).toEqual({
        ok: false,
        reason: "invalid",
      });
    });

    it("un alumno no crea plantillas ni las ve", async () => {
      expect(
        await createTemplate({ db: studentDb, coachId, input: { name: "X", weeksCount: 4 } }),
      ).toEqual({
        ok: false,
        reason: "forbidden",
      });
      expect(await listTemplates(studentDb)).toEqual([]);
    });

    it("borra una plantilla con todo su contenido", async () => {
      const id = await newTemplate();
      await addSession({ db: coachDb, programId: id, weekNumber: 1 });
      expect(await deleteTemplate({ db: coachDb, id })).toEqual({ ok: true });
      expect(await getProgramTree(coachDb, id)).toBeNull();
      const { count } = await admin
        .from("program_sessions")
        .select("id", { count: "exact", head: true })
        .eq("program_id", id);
      expect(count).toBe(0);
    });
  });

  describe("sesiones y ejercicios (T61 a T63)", () => {
    it("agrega sesiones A, B, C… por semana hasta 7 y rechaza la octava", async () => {
      const id = await newTemplate();
      const labels: string[] = [];
      for (let i = 0; i < 7; i++) {
        const result = await addSession({ db: coachDb, programId: id, weekNumber: 2 });
        expect(result.ok).toBe(true);
        if (result.ok) labels.push(result.label);
      }
      expect(labels).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
      expect(await addSession({ db: coachDb, programId: id, weekNumber: 2 })).toEqual({
        ok: false,
        reason: "limit",
      });
    });

    it("una semana sin sesiones (descarga) es válida", async () => {
      const id = await newTemplate(3);
      await addSession({ db: coachDb, programId: id, weekNumber: 1 });
      const tree = await getProgramTree(coachDb, id);
      expect(tree!.sessions.filter((s) => s.weekNumber === 2)).toHaveLength(0);
    });

    it("rechaza sesiones en una semana fuera del programa", async () => {
      const id = await newTemplate(2);
      expect(await addSession({ db: coachDb, programId: id, weekNumber: 3 })).toEqual({
        ok: false,
        reason: "invalid",
      });
      expect(await addSession({ db: coachDb, programId: id, weekNumber: 0 })).toEqual({
        ok: false,
        reason: "invalid",
      });
    });

    it("agrega ejercicios con su prescripción y los devuelve en orden", async () => {
      const id = await newTemplate();
      const session = await addSession({ db: coachDb, programId: id, weekNumber: 1 });
      if (!session.ok) throw new Error("sesión");
      expect(
        (
          await addSessionExercise({
            db: coachDb,
            sessionId: session.id,
            input: prescription(squatId, { targetWeightKg: "60", note: "bajar lento" }),
          })
        ).ok,
      ).toBe(true);
      expect(
        (
          await addSessionExercise({
            db: coachDb,
            sessionId: session.id,
            input: prescription(benchId, { sets: 4, repsMin: 6, repsMax: 8 }),
          })
        ).ok,
      ).toBe(true);

      const tree = await getProgramTree(coachDb, id);
      const exercises = tree!.sessions[0].exercises;
      expect(exercises.map((e) => e.name)).toEqual(["Sentadilla", "Press de banca"]);
      expect(exercises[0]).toMatchObject({
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        targetWeightKg: 60,
        note: "bajar lento",
      });
      expect(exercises[1]).toMatchObject({
        sets: 4,
        repsMin: 6,
        repsMax: 8,
        targetWeightKg: null,
        note: null,
      });
    });

    it("valida la prescripción con los límites de la spec", async () => {
      const id = await newTemplate();
      const session = await addSession({ db: coachDb, programId: id, weekNumber: 1 });
      if (!session.ok) throw new Error("sesión");
      for (const bad of [
        { sets: 0 },
        { sets: 11 },
        { repsMin: 13, repsMax: 12 },
        { repsMax: 101 },
        { targetWeightKg: "501" },
      ]) {
        expect(
          await addSessionExercise({
            db: coachDb,
            sessionId: session.id,
            input: prescription(squatId, bad),
          }),
        ).toEqual({
          ok: false,
          reason: "invalid",
        });
      }
    });

    it("rechaza ejercicios archivados o inexistentes", async () => {
      const id = await newTemplate();
      const session = await addSession({ db: coachDb, programId: id, weekNumber: 1 });
      if (!session.ok) throw new Error("sesión");
      expect(
        await addSessionExercise({
          db: coachDb,
          sessionId: session.id,
          input: prescription(archivedId),
        }),
      ).toEqual({
        ok: false,
        reason: "invalid",
      });
      expect(
        await addSessionExercise({
          db: coachDb,
          sessionId: session.id,
          input: prescription("00000000-0000-4000-8000-00000000dead"),
        }),
      ).toEqual({ ok: false, reason: "invalid" });
    });

    it("admite hasta 15 ejercicios por sesión y rechaza el 16", async () => {
      const id = await newTemplate();
      const session = await addSession({ db: coachDb, programId: id, weekNumber: 1 });
      if (!session.ok) throw new Error("sesión");
      for (let i = 0; i < 15; i++) {
        expect(
          (
            await addSessionExercise({
              db: coachDb,
              sessionId: session.id,
              input: prescription(squatId),
            })
          ).ok,
        ).toBe(true);
      }
      expect(
        await addSessionExercise({
          db: coachDb,
          sessionId: session.id,
          input: prescription(squatId),
        }),
      ).toEqual({
        ok: false,
        reason: "limit",
      });
    });

    it("edita y quita ejercicios", async () => {
      const id = await newTemplate();
      const session = await addSession({ db: coachDb, programId: id, weekNumber: 1 });
      if (!session.ok) throw new Error("sesión");
      const added = await addSessionExercise({
        db: coachDb,
        sessionId: session.id,
        input: prescription(squatId),
      });
      if (!added.ok) throw new Error("ejercicio");

      expect(
        await updateSessionExercise({
          db: coachDb,
          id: added.id,
          input: prescription(squatId, { sets: 5, repsMin: 5, repsMax: 5 }),
        }),
      ).toMatchObject({ ok: true });
      expect((await getProgramTree(coachDb, id))!.sessions[0].exercises[0]).toMatchObject({
        sets: 5,
        repsMin: 5,
        repsMax: 5,
      });

      expect(await removeSessionExercise({ db: coachDb, id: added.id })).toMatchObject({
        ok: true,
      });
      expect((await getProgramTree(coachDb, id))!.sessions[0].exercises).toHaveLength(0);
    });

    it("reordena los ejercicios y conserva el orden", async () => {
      const id = await newTemplate();
      const session = await addSession({ db: coachDb, programId: id, weekNumber: 1 });
      if (!session.ok) throw new Error("sesión");
      const a = await addSessionExercise({
        db: coachDb,
        sessionId: session.id,
        input: prescription(squatId),
      });
      const b = await addSessionExercise({
        db: coachDb,
        sessionId: session.id,
        input: prescription(benchId),
      });
      if (!a.ok || !b.ok) throw new Error("ejercicios");

      expect(
        await reorderSessionExercises({
          db: coachDb,
          sessionId: session.id,
          orderedIds: [b.id, a.id],
        }),
      ).toMatchObject({ ok: true });
      expect((await getProgramTree(coachDb, id))!.sessions[0].exercises.map((e) => e.name)).toEqual(
        ["Press de banca", "Sentadilla"],
      );
    });

    it("rechaza un orden que no es una permutación de los ejercicios de la sesión", async () => {
      const id = await newTemplate();
      const session = await addSession({ db: coachDb, programId: id, weekNumber: 1 });
      if (!session.ok) throw new Error("sesión");
      const a = await addSessionExercise({
        db: coachDb,
        sessionId: session.id,
        input: prescription(squatId),
      });
      if (!a.ok) throw new Error("ejercicio");
      expect(
        await reorderSessionExercises({
          db: coachDb,
          sessionId: session.id,
          orderedIds: [a.id, a.id],
        }),
      ).toEqual({ ok: false, reason: "invalid" });
      expect(
        await reorderSessionExercises({ db: coachDb, sessionId: session.id, orderedIds: [] }),
      ).toEqual({ ok: false, reason: "invalid" });
    });

    it("quitar una sesión borra sus ejercicios", async () => {
      const id = await newTemplate();
      const session = await addSession({ db: coachDb, programId: id, weekNumber: 1 });
      if (!session.ok) throw new Error("sesión");
      await addSessionExercise({
        db: coachDb,
        sessionId: session.id,
        input: prescription(squatId),
      });
      expect(await removeSession({ db: coachDb, sessionId: session.id })).toEqual({ ok: true });
      const { count } = await admin
        .from("session_exercises")
        .select("id", { count: "exact", head: true })
        .eq("program_session_id", session.id);
      expect(count).toBe(0);
    });

    it("un alumno no puede modificar un programa (ni su propio programa asignado)", async () => {
      const id = await newTemplate();
      const assigned = await assignProgram({
        db: coachDb,
        templateId: id,
        studentId,
        startDate: addDays(mondayOf(santiagoDate(new Date())), 28),
      });
      if (!assigned.ok) throw new Error("asignar");
      const result = await addSession({
        db: studentDb,
        programId: assigned.programId,
        weekNumber: 1,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("copiar semana (T64)", () => {
    async function templateWithWeekOne() {
      const id = await newTemplate(3);
      const session = await addSession({ db: coachDb, programId: id, weekNumber: 1 });
      if (!session.ok) throw new Error("sesión");
      await addSessionExercise({
        db: coachDb,
        sessionId: session.id,
        input: prescription(squatId, { sets: 4 }),
      });
      return id;
    }

    it("duplica sesiones y prescripciones en una semana vacía", async () => {
      const id = await templateWithWeekOne();
      expect(await copyWeek({ db: coachDb, programId: id, fromWeek: 1, toWeek: 2 })).toEqual({
        ok: true,
        sessions: 1,
      });
      const tree = await getProgramTree(coachDb, id);
      const week2 = tree!.sessions.filter((s) => s.weekNumber === 2);
      expect(week2).toHaveLength(1);
      expect(week2[0].exercises[0]).toMatchObject({ name: "Sentadilla", sets: 4 });
    });

    it("pide confirmación para pisar una semana con contenido", async () => {
      const id = await templateWithWeekOne();
      await copyWeek({ db: coachDb, programId: id, fromWeek: 1, toWeek: 2 });
      expect(await copyWeek({ db: coachDb, programId: id, fromWeek: 1, toWeek: 2 })).toEqual({
        ok: false,
        reason: "destination_not_empty",
      });
      expect(
        await copyWeek({ db: coachDb, programId: id, fromWeek: 1, toWeek: 2, replace: true }),
      ).toEqual({ ok: true, sessions: 1 });
    });

    it("editar la copia no cambia la semana original", async () => {
      const id = await templateWithWeekOne();
      await copyWeek({ db: coachDb, programId: id, fromWeek: 1, toWeek: 2 });
      const tree = await getProgramTree(coachDb, id);
      const copied = tree!.sessions.find((s) => s.weekNumber === 2)!.exercises[0];
      await updateSessionExercise({
        db: coachDb,
        id: copied.id,
        input: prescription(squatId, { sets: 9 }),
      });
      const after = await getProgramTree(coachDb, id);
      expect(after!.sessions.find((s) => s.weekNumber === 1)!.exercises[0].sets).toBe(4);
    });

    it("rechaza semanas inválidas", async () => {
      const id = await templateWithWeekOne();
      expect(await copyWeek({ db: coachDb, programId: id, fromWeek: 1, toWeek: 1 })).toEqual({
        ok: false,
        reason: "invalid",
      });
      expect(await copyWeek({ db: coachDb, programId: id, fromWeek: 1, toWeek: 4 })).toEqual({
        ok: false,
        reason: "invalid",
      });
    });
  });

  describe("asignar (T65)", () => {
    it("asigna a un alumno, ajusta al lunes y lo lista como programa del alumno", async () => {
      const id = await newTemplate(2, "Para asignar");
      const monday = addDays(mondayOf(santiagoDate(new Date())), 14);
      const result = await assignProgram({
        db: coachDb,
        templateId: id,
        studentId,
        startDate: addDays(monday, 2),
      });
      expect(result.ok).toBe(true);

      const assigned = await listAssignedPrograms(coachDb, studentId);
      expect(assigned.find((p) => p.name === "Para asignar")).toMatchObject({
        studentId,
        startDate: monday,
        weeksCount: 2,
      });
    });

    it("el coach puede asignarse un programa a sí mismo (RF-49)", async () => {
      const id = await newTemplate(1);
      const result = await assignProgram({
        db: coachDb,
        templateId: id,
        studentId: coachId,
        startDate: addDays(mondayOf(santiagoDate(new Date())), 7),
      });
      expect(result.ok).toBe(true);
    });

    it("rechaza una fecha anterior al lunes de esta semana", async () => {
      const id = await newTemplate(2);
      const past = addDays(mondayOf(santiagoDate(new Date())), -7);
      expect(
        await assignProgram({ db: coachDb, templateId: id, studentId, startDate: past }),
      ).toEqual({ ok: false, reason: "past_date" });
    });

    it("rechaza una plantilla inexistente y a quien no es alumno del coach", async () => {
      const monday = mondayOf(santiagoDate(new Date()));
      expect(
        await assignProgram({
          db: coachDb,
          templateId: "00000000-0000-4000-8000-00000000dead",
          studentId,
          startDate: monday,
        }),
      ).toEqual({ ok: false, reason: "not_found" });
      const id = await newTemplate(1);
      expect(
        await assignProgram({ db: studentDb, templateId: id, studentId, startDate: monday }),
      ).toEqual({ ok: false, reason: "forbidden" });
    });
  });

  describe("semanas bloqueadas en programas asignados (T66, RF-17)", () => {
    // Programa asignado de 3 semanas que empieza el lunes 2025-03-03, creado a mano con fechas fijas
    // (en el pasado, para no chocar con los programas asignados con fechas relativas a hoy).
    async function assignedProgram() {
      await admin.from("programs").delete().eq("name", "Asignado fijo");
      const { data: program } = await admin
        .from("programs")
        .insert({
          coach_id: coachId,
          student_id: studentId,
          name: "Asignado fijo",
          weeks_count: 3,
          start_date: "2025-03-03",
          ends_on: "2025-03-23",
        })
        .select("id")
        .single();
      const { data: s1 } = await admin
        .from("program_sessions")
        .insert({ program_id: program!.id, week_number: 1, label: "A" })
        .select("id")
        .single();
      const { data: s3 } = await admin
        .from("program_sessions")
        .insert({ program_id: program!.id, week_number: 3, label: "A" })
        .select("id")
        .single();
      return { id: program!.id, week1Session: s1!.id, week3Session: s3!.id };
    }

    it("en la semana en curso no se agregan sesiones ni ejercicios, pero sí en las siguientes", async () => {
      const program = await assignedProgram();
      const today = "2025-03-12"; // semana 2
      expect(
        await addSession({ db: coachDb, programId: program.id, weekNumber: 1, today }),
      ).toEqual({ ok: false, reason: "week_locked" });
      expect(
        await addSession({ db: coachDb, programId: program.id, weekNumber: 2, today }),
      ).toEqual({ ok: false, reason: "week_locked" });
      expect(
        (await addSession({ db: coachDb, programId: program.id, weekNumber: 3, today })).ok,
      ).toBe(true);

      expect(
        await addSessionExercise({
          db: coachDb,
          sessionId: program.week1Session,
          input: prescription(squatId),
          today,
        }),
      ).toEqual({ ok: false, reason: "week_locked" });
      expect(
        (
          await addSessionExercise({
            db: coachDb,
            sessionId: program.week3Session,
            input: prescription(squatId),
            today,
          })
        ).ok,
      ).toBe(true);
    });

    it("tampoco se quitan ni se copian semanas hacia una semana bloqueada", async () => {
      const program = await assignedProgram();
      const today = "2025-03-12";
      expect(await removeSession({ db: coachDb, sessionId: program.week1Session, today })).toEqual({
        ok: false,
        reason: "week_locked",
      });
      expect(
        await copyWeek({
          db: coachDb,
          programId: program.id,
          fromWeek: 3,
          toWeek: 1,
          replace: true,
          today,
        }),
      ).toEqual({ ok: false, reason: "week_locked" });
      expect(
        (
          await copyWeek({
            db: coachDb,
            programId: program.id,
            fromWeek: 1,
            toWeek: 3,
            replace: true,
            today,
          })
        ).ok,
      ).toBe(true);
    });

    it("un programa que aún no empezó se edita entero", async () => {
      const program = await assignedProgram();
      expect(
        (
          await addSession({
            db: coachDb,
            programId: program.id,
            weekNumber: 1,
            today: "2025-02-26",
          })
        ).ok,
      ).toBe(true);
    });

    it("un programa terminado no se edita", async () => {
      const program = await assignedProgram();
      expect(
        await addSession({
          db: coachDb,
          programId: program.id,
          weekNumber: 3,
          today: "2025-03-24",
        }),
      ).toEqual({ ok: false, reason: "week_locked" });
    });

    it("las plantillas nunca se bloquean", async () => {
      const id = await newTemplate();
      expect(
        (await addSession({ db: coachDb, programId: id, weekNumber: 1, today: "2099-01-01" })).ok,
      ).toBe(true);
    });
  });
});
