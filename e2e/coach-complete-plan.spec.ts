// T219 · Acceptance through the real isolated backend; never production.
import { randomUUID } from "node:crypto";
import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import type { Database } from "../src/types/database";
import { COACH, admin, createUser, resetAll, seedCoach } from "./support/db";
import { login } from "./support/ui";
import { mondayOf, santiagoDate } from "../src/domain/dates";
import { defaultPrescriptionInput, parsePrescriptionInput } from "../src/domain/prescription-input";
import { trainingMetricCases } from "../src/test/fixtures/training-metrics";
import { readStoredTrainingPrescription } from "../src/domain/stored-prescription";
import { MobileClient, type Transport } from "../mobile/src/lib/client";
import { TrainingController, isTypedTraining } from "../mobile/src/lib/training";
import { chooseTypedAlternative, editTypedSet } from "../mobile/src/lib/typed-training";
import { sendQueuedRecording, type QueuedWorkoutPayload } from "../mobile/src/lib/queued-recording";

type Person = { id: string; name: string; email: string; password: string };
const people: Person[] = [];
let templateId: string;
let exerciseIds: string[];
const password = "Integral-local-only-2026!";
async function snapshot(id: string) {
  const result = await admin()
    .from("programs")
    .select("*,program_sessions(*,session_exercises(*,session_exercise_alternatives(*)))")
    .eq("id", id)
    .single();
  expect(result.error).toBeNull();
  const value = result.data!;
  return {
    ...value,
    program_sessions: value.program_sessions
      .toSorted((a, b) => a.week_number - b.week_number || a.label.localeCompare(b.label))
      .map((session) => ({
        ...session,
        session_exercises: session.session_exercises
          .toSorted((a, b) => a.position - b.position)
          .map((exercise) => ({
            ...exercise,
            session_exercise_alternatives: exercise.session_exercise_alternatives.toSorted(
              (a, b) => a.position - b.position,
            ),
          })),
      })),
  };
}
type Program = Awaited<ReturnType<typeof snapshot>>;
function sessions(p: Program) {
  return p.program_sessions.toSorted(
    (a, b) => a.week_number - b.week_number || a.label.localeCompare(b.label),
  );
}
function shape(p: Program) {
  return sessions(p).map((s) => {
    const rows = s.session_exercises.toSorted((a, b) => a.position - b.position);
    return {
      week: s.week_number,
      label: s.label,
      title: s.title,
      weekday: s.weekday,
      rows: rows.map((e) => ({
        exercise: e.exercise_id,
        prescribed: readStoredTrainingPrescription(e),
        note: e.note,
        rest: e.rest_seconds,
        groupRest: e.superset_rest_seconds,
        group: e.superset_id
          ? rows.filter((r) => r.superset_id === e.superset_id).map((r) => r.position)
          : null,
        alternatives: e.session_exercise_alternatives
          .toSorted((a, b) => a.position - b.position)
          .map((a) => ({
            exercise: a.exercise_id,
            prescribed: readStoredTrainingPrescription(a),
          })),
      })),
    };
  });
}
function ids(p: Program) {
  return new Set(
    sessions(p).flatMap((s) => [
      s.id,
      ...s.session_exercises.flatMap((e) => [
        e.id,
        ...(e.superset_id ? [e.superset_id] : []),
        ...e.session_exercise_alternatives.map((a) => a.id),
      ]),
    ]),
  );
}
function independent(a: Program, b: Program) {
  const originals = ids(a);
  expect([...ids(b)].some((id) => originals.has(id))).toBe(false);
}
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  people.length = 0;
  people.push({
    id: coachId,
    name: "Coach",
    email: COACH.email,
    password: COACH.password,
  });
  for (let i = 0; i < 3; i++) {
    const email = `integral-${i}@iron-strength.e2e.test`,
      name = `Integral Alumno ${i}`;
    const id = await createUser(admin(), {
      role: "student",
      name,
      email,
      password,
      coachId,
    });
    people.push({ id, name, email, password });
  }
  exerciseIds = [];
  for (const [i, m] of trainingMetricCases.entries()) {
    const id = randomUUID();
    const result = await admin()
      .from("exercises")
      .insert({
        id,
        coach_id: coachId,
        name: `Integral tipo ${i}`,
        muscle_group: "Core",
        record_type: m.recordType,
      });
    expect(result.error).toBeNull();
    exerciseIds.push(id);
  }
  templateId = randomUUID();
  expect(
    (
      await admin().from("programs").insert({
        id: templateId,
        coach_id: coachId,
        name: "Base integral cuatro semanas",
        weeks_count: 4,
      })
    ).error,
  ).toBeNull();
  for (let week = 1; week <= 4; week++) {
    const sessionId = randomUUID(),
      group = randomUUID();
    expect(
      (
        await admin().from("program_sessions").insert({
          id: sessionId,
          program_id: templateId,
          week_number: week,
          label: "A",
          title: "Mixta integral",
          weekday: 1,
        })
      ).error,
    ).toBeNull();
    const rows: Database["public"]["Tables"]["session_exercises"]["Insert"][] =
      trainingMetricCases.map((m, i) => {
        const input = defaultPrescriptionInput(m.recordType);
        input.sets = "1";
        input.target.targetWeightKg = m.weightKg === null ? "" : String(m.weightKg);
        input.target.targetDurationSeconds =
          m.durationSeconds === null ? "" : String(m.durationSeconds);
        input.target.targetDistanceMeters =
          m.distanceMeters === null ? "" : String(m.distanceMeters);
        const prescribed =
          i === 0
            ? parsePrescriptionInput({
                mode: "series",
                recordType: null,
                series: ["30", "35"].map((weight) => ({
                  ...input.target,
                  repsMin: "8",
                  repsMax: "10",
                  targetWeightKg: weight,
                })),
              })
            : parsePrescriptionInput(input);
        return {
          id: randomUUID(),
          program_session_id: sessionId,
          exercise_id: exerciseIds[i],
          position: i,
          sets: prescribed.sets,
          reps_min: null,
          reps_max: null,
          typed_prescription: prescribed,
          note: `Indicación ${i}`,
          rest_seconds: 30,
          superset_id: i < 2 ? group : null,
          superset_rest_seconds: i < 2 ? 45 : null,
        };
      });
    expect((await admin().from("session_exercises").insert(rows)).error).toBeNull();
    const alt = defaultPrescriptionInput("weight_duration");
    alt.sets = "1";
    alt.target.targetWeightKg = "20";
    alt.target.targetDurationSeconds = "60";
    expect(
      (
        await admin()
          .from("session_exercise_alternatives")
          .insert({
            session_exercise_id: rows[5].id!,
            exercise_id: exerciseIds[6],
            position: 0,
            sets: 1,
            reps_min: null,
            reps_max: null,
            typed_prescription: parsePrescriptionInput(alt),
          })
      ).error,
    ).toBeNull();
  }
});
test.afterAll(async () => {
  await resetAll();
});
async function adaptAndAssign(page: Page, person: Person, index: number) {
  if (index === 0) {
    await page.goto(`/coach/programs/${templateId}?alumno=${person.id}`);
    await page.getByText("Duplicar programa", { exact: true }).click();
  } else {
    await page.goto(`/coach/students/${person.id}?semanas=12`);
    await page.getByRole("button", { name: "Asignar un programa", exact: true }).click();
    await page.getByLabel("Buscar una base", { exact: true }).fill("Base integral cuatro semanas");
    await page
      .getByRole("button", {
        name: "Usar Base integral cuatro semanas",
        exact: true,
      })
      .click();
  }
  await page.getByLabel("Nombre de la copia", { exact: true }).fill(`Integral adaptada ${index}`);
  await page.getByRole("button", { name: "Crear copia", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: `Integral adaptada ${index}`,
      exact: true,
    }),
  ).toBeVisible();
  const copyId = new URL(page.url()).pathname.split("/").at(-1)!;
  if (index > 0) expect(new URL(page.url()).searchParams.get("alumno")).toBe(person.id);
  await page
    .getByLabel("Peso (kg) de Integral tipo 1", { exact: true })
    .filter({ visible: true })
    .fill(String(40 + index));
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  const before = await snapshot(copyId);
  await page.getByText("Copiar semana a varias", { exact: true }).click();
  for (const week of [2, 3, 4])
    await page.getByRole("checkbox", { name: `Semana ${week}`, exact: true }).check();
  await page.getByRole("button", { name: "Revisar copia", exact: true }).click();
  for (const week of [2, 3, 4])
    await page.getByRole("checkbox", { name: `Reemplazar semana ${week}`, exact: true }).check();
  expect(await snapshot(copyId)).toEqual(before);
  await page.getByRole("button", { name: "Confirmar copia de semanas", exact: true }).click();
  await expect(page.getByText("Copia de semanas confirmada.", { exact: true })).toBeVisible();
  const copied = await snapshot(copyId);
  const pattern = shape(copied)[0];
  expect(shape(copied)).toEqual([1, 2, 3, 4].map((week) => ({ ...pattern, week })));
  await page.getByText("Asignar a un alumno", { exact: true }).click();
  await page.getByLabel("Alumno", { exact: true }).selectOption(person.id);
  await page.getByLabel("Inicio", { exact: true }).fill(mondayOf(santiagoDate(new Date())));
  await page.getByRole("button", { name: "Revisar asignación", exact: true }).click();
  const preview = page.getByRole("region", {
    name: "Vista previa de asignación",
    exact: true,
  });
  await expect(preview).toContainText("4 sesiones");
  await page.getByRole("button", { name: "Confirmar asignación", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname.split("/").at(-1)).not.toBe(copyId);
  const assignedId = new URL(page.url()).pathname.split("/").at(-1)!;
  const assigned = await snapshot(assignedId);
  expect(assigned.student_id).toBe(person.id);
  expect(assigned.start_date).toBe(mondayOf(santiagoDate(new Date())));
  expect(shape(assigned)).toEqual(shape(copied));
  independent(copied, assigned);
  await expect(
    page.getByText("Semana bloqueada", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar sesión", exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^Semana 2/ }).click();
  await expect(
    page.getByRole("button", { name: "Guardar sesión", exact: true }).filter({ visible: true }),
  ).toBeVisible();
  return { copy: copied, assigned, sessionId: sessions(assigned)[0].id };
}
async function nativeWorkout(request: APIRequestContext, person: Person, sessionId: string) {
  let credential: string | null = null,
    lose = true;
  const sent: string[] = [];
  const transport: Transport = async (url, init) => {
    const response = await request.fetch(url, {
      method: init.method,
      headers: init.headers as Record<string, string>,
      data: init.body as string | undefined,
    });
    if (url.endsWith("/typed-recordings") && init.method === "POST") {
      sent.push(String(init.body));
      if (lose && response.ok()) {
        lose = false;
        throw new TypeError("lost after actual commit");
      }
    }
    return new Response(await response.text(), {
      status: response.status(),
      headers: response.headers(),
    });
  };
  const client = new MobileClient(
    "http://127.0.0.1:3100",
    {
      get: async () => credential,
      set: async (v) => {
        credential = v;
      },
      remove: async () => {
        credential = null;
      },
    },
    transport,
    Date.now,
    true,
  );
  await client.login(person.email, person.password);
  const context = await client.assignedRoutine(sessionId);
  expect(context.userId).toBe(person.id);
  expect(context.exercises.map((e) => e.prescribed.recordType)).toEqual(
    trainingMetricCases.map((m) => m.recordType),
  );
  const values = new Map<string, string>();
  const storage = {
    get: async (k: string) => values.get(k) ?? null,
    set: async (k: string, v: string) => {
      values.set(k, v);
    },
    remove: async (k: string) => {
      values.delete(k);
    },
    compareAndSet: async (k: string, b: string | null, v: string) => {
      if ((values.get(k) ?? null) !== b) throw Error("conflict");
      values.set(k, v);
    },
  };
  const create = () =>
    new TrainingController(person.id, storage, (p: QueuedWorkoutPayload) =>
      sendQueuedRecording(client, p, person.id),
    );
  let controller = create();
  await controller.restore();
  await controller.startTyped(context);
  controller.editTyped((d) => chooseTypedAlternative(context, d, 5, exerciseIds[6]));
  await controller.flush();
  const metrics = trainingMetricCases.map((m, i) => (i === 5 ? trainingMetricCases[6] : m));
  for (const [i, m] of metrics.entries()) {
    controller.editTyped((d) => {
      let next = d;
      for (const [field, value] of [
        ["weight", m.weightKg],
        ["reps", m.reps],
        ["duration", m.durationSeconds],
        ["distance", m.distanceMeters],
      ] as const)
        if (value !== null) next = editTypedSet(next, i, 0, field, String(value));
      return {
        ...next,
        exercises: next.exercises.map((e, n) =>
          n === 7 ? { ...e, athleteNote: "Nota propia integral" } : e,
        ),
      };
    });
    await controller.flush();
    await controller.complete(i, 0);
    if (i === 1) {
      const previous = controller.getSnapshot().active;
      if (!previous || !isTypedTraining(previous)) throw Error("typed active");
      const end = previous.draft.rest?.endsAt;
      expect(previous.draft.rest?.totalSeconds).toBe(45);
      expect(end).toEqual(expect.any(Number));
      expect(end!).toBeGreaterThan(Date.now());
      controller = create();
      await controller.restore();
      const recovered = controller.getSnapshot().active;
      if (!recovered || !isTypedTraining(recovered)) throw Error("typed recovery");
      expect(recovered.draft.rest?.endsAt).toBe(end);
      expect(recovered.draft.exercises[5].exerciseId).toBe(exerciseIds[6]);
      expect(recovered.routine).toEqual(context);
    }
  }
  await expect(controller.finish(8, `Cierre integral ${person.name}`)).rejects.toThrow();
  const frozen = controller.getSnapshot().active?.payload;
  if (!frozen || frozen.version !== 3) throw Error("frozen payload");
  controller = create();
  await controller.restore();
  await client.reconnect();
  await controller.retry();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe(sent[0]);
  expect(controller.getSnapshot().active).toBeNull();
  const result = await client.typedWorkout(frozen.id);
  expect(result.workout.sourceKind).toBe("assigned");
  expect(result.workout.exercises.flatMap((e) => e.sets.map((s) => s.metrics))).toEqual(metrics);
  expect(result.workout.exercises[5].prescribedExerciseId).toBe(exerciseIds[5]);
  expect(result.workout.exercises[5].exerciseId).toBe(exerciseIds[6]);
  expect(result.workout.exercises[7].athleteNote).toBe("Nota propia integral");
  expect(result.workout.exercises[7].note).toBe("Indicación 7");
  return frozen.id;
}
async function webWorkout(page: Page, person: Person, sessionId: string) {
  await login(page, person.email, person.password);
  await page.goto(`/workout/${sessionId}`);
  for (const [i, m] of trainingMetricCases.entries()) {
    await page.getByRole("button", { name: `Ir a Integral tipo ${i}`, exact: true }).click();
    const region = page.getByRole("region", {
      name: `Integral tipo ${i}`,
      exact: true,
    });
    if (m.weightKg !== null)
      await region.getByRole("textbox", { name: /KG.*serie 1$/ }).fill(String(m.weightKg));
    if (m.reps !== null)
      await region.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill(String(m.reps));
    if (m.durationSeconds !== null)
      await region
        .getByRole("textbox", { name: "SEGUNDOS serie 1", exact: true })
        .fill(String(m.durationSeconds));
    if (m.distanceMeters !== null)
      await region
        .getByRole("textbox", { name: "METROS serie 1", exact: true })
        .fill(String(m.distanceMeters));
    await region.getByRole("button", { name: "Completar serie 1", exact: true }).click();
  }
  await page.reload();
  await page.getByRole("button", { name: "Terminar entrenamiento", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Cerrar entrenamiento" });
  await expect(dialog).toContainText("9 series realizadas");
  await expect(dialog).toContainText("1 pendiente");
  await dialog.getByLabel("Nota del entrenamiento").fill(`Cierre integral ${person.name}`);
  await dialog.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
  await expect(page.getByText("Guardado en tu cuenta", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ver resultado", exact: true }).click();
  await expect(page).toHaveURL(/\/history\//);
  return new URL(page.url()).pathname.split("/").at(-1)!;
}
test("cuatro semanas mixtas: adaptar, asignar a cuatro cuentas, entrenar y revisar/exportar sin modificar la base", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(480000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, COACH.email, COACH.password);
  const original = await snapshot(templateId);
  const assigned: Awaited<ReturnType<typeof adaptAndAssign>>[] = [];
  for (const [i, person] of people.entries()) {
    const result = await adaptAndAssign(page, person, i);
    independent(original, result.copy);
    independent(original, result.assigned);
    expect(await snapshot(templateId)).toEqual(original);
    assigned.push(result);
  }
  const workoutIds: string[] = [],
    csv: string[] = [];
  for (const [i, person] of people.entries()) {
    const context = await browser.newContext({
        viewport: { width: 360, height: 800 },
      }),
      own = await context.newPage();
    try {
      if (i === 1) workoutIds[i] = await webWorkout(own, person, assigned[i].sessionId);
      else {
        workoutIds[i] = await nativeWorkout(request, person, assigned[i].sessionId);
        await login(own, person.email, person.password);
      }
      const exported = await own.request.get("/export/history");
      expect(exported.status()).toBe(200);
      csv[i] = await exported.text();
      expect(csv[i]).toContain(workoutIds[i]);
      expect(csv[i]).toContain(`Cierre integral ${person.name}`);
      expect(csv[i].trim().split("\r\n")).toHaveLength(10);
    } finally {
      await context.close();
    }
    expect(await snapshot(assigned[i].assigned.id)).toEqual(assigned[i].assigned);
    expect((await admin().from("workouts").select("id").eq("student_id", person.id)).data).toEqual([
      { id: workoutIds[i] },
    ]);
  }
  for (const [i, person] of people.entries()) {
    if (i === 0) await page.goto(`/history/${workoutIds[i]}`);
    else {
      await page.goto(`/coach/students/${person.id}?semanas=12`);
      await page
        .getByRole("button", {
          name: "Revisar último entrenamiento",
          exact: true,
        })
        .click();
    }
    await expect(page).toHaveURL(new RegExp(`/history/${workoutIds[i]}`));
    await expect(page.getByText(`Cierre integral ${person.name}`, { exact: true })).toBeVisible();
    const first = page.getByRole("region", {
      name: "Integral tipo 0",
      exact: true,
    });
    await first.getByText("Objetivos e indicaciones", { exact: true }).click();
    await expect(first.getByText("Serie 2 · 8–10 reps · 35 kg", { exact: true })).toBeVisible();
    await expect(first.getByText("Descanso de la ronda: 45 s", { exact: true })).toBeVisible();
    if (i !== 1)
      await expect(page.getByText("En lugar de Integral tipo 5", { exact: true })).toBeVisible();
    const exported = await page.request.get(`/export/history?alumno=${person.id}`);
    expect(exported.status()).toBe(200);
    expect(await exported.text()).toBe(csv[i]);
  }
  expect(await snapshot(templateId)).toEqual(original);
});
