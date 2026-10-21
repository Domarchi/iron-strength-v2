// T99 · RF-24: si se corta la red al finalizar, no se pierde nada ni se duplica al reintentar.
import { expect, test } from "@playwright/test";
import { admin, createUser, resetAll, seedCoach, seedProgram } from "./support/db";
import { login } from "./support/ui";
import { addDays, mondayOf, santiagoDate } from "../src/domain/dates";
import { createDraft, finishDraft } from "../src/lib/workout/runner-state";
import { legacyDraftKey } from "../src/lib/workout/draft";

const STUDENT = {
  email: "luz@iron-strength.e2e.test",
  name: "Luz Soto",
  password: "Contraseña-E2E-2026!",
};

test("recupera desde Mi semana un entrenamiento pendiente de la semana anterior sin habilitar sesiones nuevas", async ({
  page,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const studentId = await createUser(admin(), { role: "student", ...STUDENT, coachId });
  const seeded = await seedProgram({ coachId, studentId });
  const thisMonday = mondayOf(santiagoDate(new Date()));
  const { error } = await admin()
    .from("programs")
    .update({
      start_date: addDays(thisMonday, -7),
      ends_on: addDays(thisMonday, 6),
    })
    .eq("id", seeded.programId);
  expect(error).toBeNull();
  const sourceRow = (
    await admin()
      .from("session_exercises")
      .select("id")
      .eq("program_session_id", seeded.sessionId)
      .eq("position", 0)
      .single()
  ).data!;
  const started = new Date(`${addDays(thisMonday, -1)}T15:00:00.000Z`);
  const initial = createDraft({
    workoutId: crypto.randomUUID(),
    userId: studentId,
    plannedSession: { id: seeded.sessionId, programId: seeded.programId, label: "A" },
    now: started,
    exercises: [
      {
        sessionExerciseId: sourceRow.id,
        exerciseId: seeded.exercises.get("Sentadilla")!,
        name: "Sentadilla",
        isBodyweight: false,
        lastWeightKg: null,
        prescribed: { sets: 1, repsMin: 8, repsMax: 12, targetWeightKg: 60 },
      },
    ],
  });
  initial.exercises[0].sets[0] = { ...initial.exercises[0].sets[0], done: true, reps: "10" };
  const pending = finishDraft(initial, new Date(started.getTime() + 3600_000));
  await login(page, STUDENT.email, STUDENT.password);
  await page.evaluate(({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)), {
    key: legacyDraftKey(studentId, seeded.sessionId),
    draft: { ...pending, version: 1 },
  });
  await page.goto("/week");
  const sync = page.getByRole("region", { name: "Sincronización de entrenamientos", exact: true });
  await expect(sync.getByRole("status")).toContainText("Entrenamiento sincronizado.");
  await sync.getByRole("link", { name: "Ver entrenamiento", exact: true }).click();
  await expect(page.getByText("¡Entrenamiento guardado!")).toBeVisible();
  const { data: saved, error: readError } = await admin()
    .from("workouts")
    .select("id, started_at, duration_seconds")
    .eq("student_id", studentId);
  expect(readError).toBeNull();
  expect(saved).toHaveLength(1);
  expect(saved![0]).toMatchObject({ id: pending.workoutId, duration_seconds: 3600 });
  expect(Date.parse(saved![0].started_at)).toBe(started.getTime());

  await page.goto(`/workout/${seeded.sessionId}`);
  await expect(page.getByText("Esta sesión no está disponible hoy.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Terminar entrenamiento" })).toHaveCount(0);
});

test("sin conexión al finalizar: el entrenamiento queda a salvo y se guarda una sola vez al volver la red", async ({
  page,
  context,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const studentId = await createUser(admin(), { role: "student", ...STUDENT, coachId });
  await seedProgram({ coachId, studentId });

  await login(page, STUDENT.email, STUDENT.password);
  await page.goto("/week");
  await page.getByRole("button", { name: "Empezar", exact: true }).click();

  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("60");
  await page.getByLabel("Repeticiones de la serie 1 de Sentadilla").fill("10");
  await page.getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla" }).click();

  // Se corta la red justo antes de finalizar
  await context.setOffline(true);
  await page.getByRole("button", { name: "Finalizar entrenamiento" }).click();
  await page.getByRole("button", { name: "Sí, finalizar" }).click();

  await expect(page.getByText("Pendiente de enviar")).toBeVisible();
  await expect(page.getByText(/No hay conexión con el servidor/)).toBeVisible();
  const { count: beforeRetry } = await admin()
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);
  expect(beforeRetry).toBe(0);

  // Recuperar conexión con la app abierta sincroniza automáticamente.
  await context.setOffline(false);
  await expect(page.getByText("¡Entrenamiento guardado!")).toBeVisible();

  const { count } = await admin()
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);
  expect(count).toBe(1);
  const { count: sets } = await admin()
    .from("workout_sets")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);
  expect(sets).toBe(1);

  // Y el borrador local ya no existe: volver a la sesión empieza una nueva (no reenvía la anterior)
  const leftovers = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("is:draft:")),
  );
  expect(leftovers).toEqual([]);
});
