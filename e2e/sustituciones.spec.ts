import { expect, test } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach, seedProgram } from "./support/db";
import { login } from "./support/ui";

const STUDENT = {
  email: "alternativa@iron-strength.e2e.test",
  password: "Alternativa-E2E-2026!",
  name: "Alumno alternativas",
};
let sessionId: string, studentId: string, alternativeId: string;
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  studentId = await createUser(admin(), { ...STUDENT, role: "student", coachId });
  const seeded = await seedProgram({ coachId, studentId });
  sessionId = seeded.sessionId;
  const rows = (
    await admin()
      .from("session_exercises")
      .select("id")
      .eq("program_session_id", sessionId)
      .order("position")
  ).data!;
  const groupId = crypto.randomUUID();
  expect(
    (
      await admin()
        .from("session_exercises")
        .update({ superset_id: groupId, superset_rest_seconds: 120 })
        .in(
          "id",
          rows.map((r) => r.id),
        )
    ).error,
  ).toBeNull();
  alternativeId = (
    await admin()
      .from("exercises")
      .select("id")
      .eq("name", "Prensa de piernas")
      .is("coach_id", null)
      .single()
  ).data!.id;
  expect(
    (
      await admin().from("session_exercise_alternatives").insert({
        session_exercise_id: rows[0].id,
        exercise_id: alternativeId,
        position: 0,
        sets: 2,
        reps_min: 6,
        reps_max: 10,
        target_weight_kg: 22.5,
      })
    ).error,
  ).toBeNull();
});

test("elige, recupera y registra una alternativa; el coach ve original y realizado", async ({
  page,
  browser,
}) => {
  await login(page, STUDENT.email, STUDENT.password);
  await page.goto(`/workout/${sessionId}`);
  const original = page.getByRole("region", { name: "Sentadilla", exact: true });
  await original.getByText("Alternativas del coach", { exact: true }).click();
  await original.getByLabel("Ejercicio a realizar").selectOption(alternativeId);
  await original.getByRole("button", { name: "Usar alternativa" }).click();
  const alternative = page.getByRole("region", { name: "Prensa de piernas", exact: true });
  await expect(alternative.getByText("En lugar de Sentadilla")).toBeVisible();
  await expect(alternative.getByText("Superserie 1", { exact: true })).toBeVisible();
  await expect(alternative.getByLabel("Peso de la serie 1 de Prensa de piernas (kg)")).toHaveValue(
    "22,5",
  );
  await page.reload();
  await expect(alternative.getByLabel("Peso de la serie 2 de Prensa de piernas (kg)")).toHaveValue(
    "22,5",
  );
  await alternative
    .getByRole("button", { name: "Marcar como hecha la serie 1 de Prensa de piernas", exact: true })
    .click();
  await alternative.getByText("Alternativas del coach", { exact: true }).click();
  await expect(alternative.getByLabel("Ejercicio a realizar")).toBeDisabled();
  await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Sí, finalizar" }).click();
  await expect(page.getByText("¡Entrenamiento guardado!")).toBeVisible();
  const saved = (
    await admin()
      .from("workouts")
      .select("id,workout_sets(exercise_id,prescribed_exercise_name)")
      .eq("student_id", studentId)
  ).data!;
  expect(saved).toHaveLength(1);
  expect(saved[0].workout_sets).toEqual([
    { exercise_id: alternativeId, prescribed_exercise_name: "Sentadilla" },
  ]);
  const coachContext = await browser.newContext();
  const coach = await coachContext.newPage();
  await login(coach, COACH.email, COACH.password);
  await coach.goto(`/history/${saved[0].id}`);
  await expect(coach.getByText("En lugar de Sentadilla")).toBeVisible();
  await expect(coach.getByText("Prensa de piernas", { exact: true })).toBeVisible();
  await coachContext.close();
});
