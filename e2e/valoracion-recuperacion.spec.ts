// T156 · Recuperación de valoración y nota tras una respuesta perdida en el transporte real.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { test } from "./support/network";
import { admin, createUser, resetAll, seedCoach, seedProgram, seedWorkout } from "./support/db";
import { login } from "./support/ui";

const LUIS = {
  email: "luis-valoracion@iron-strength.e2e.test",
  name: "Luis",
  password: "Contraseña-E2E-2026!",
};
let sessionId: string;

test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  const studentId = await createUser(admin(), { role: "student", ...LUIS, coachId });
  const seeded = await seedProgram({ coachId, studentId });
  sessionId = seeded.sessionId;
  // Última vez: Sentadilla 60 kg × 10 en la serie 1 (el "anterior" de la fila).
  await seedWorkout({
    studentId,
    exerciseId: seeded.exercises.get("Sentadilla")!,
    exerciseName: "Sentadilla",
    daysAgo: 3,
  });
});

async function openSession(page: Page) {
  await login(page, LUIS.email, LUIS.password);
  await page.goto(`/workout/${sessionId}`);
  await expect(page.getByRole("heading", { name: /Sesión A/ })).toBeVisible();
}

test("esfuerzo y nota se recuperan y se guardan una sola vez tras perder la respuesta (T156)", async ({
  page,
  network,
}) => {
  await openSession(page);
  await page.getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla" }).click();
  await page.getByRole("button", { name: "Terminar entrenamiento" }).click();
  await page.getByLabel("Esfuerzo percibido (opcional)", { exact: true }).selectOption("8");
  await page
    .getByLabel("Nota del entrenamiento (opcional)", { exact: true })
    .fill("Buen ritmo, última serie exigente.");
  await page.getByRole("button", { name: "Seguir entrenando", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Terminar entrenamiento" }).click();
  await expect(page.getByLabel("Esfuerzo percibido (opcional)", { exact: true })).toHaveValue("8");
  await expect(page.getByLabel("Nota del entrenamiento (opcional)", { exact: true })).toHaveValue(
    "Buen ritmo, última serie exigente.",
  );
  await page.setViewportSize({ width: 360, height: 640 });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);
  network.lostResponses.add("/api/workouts/sync");
  network.stopAfterLoss.add("/api/workouts/sync");
  await page.getByRole("button", { name: "Sí, finalizar", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Entrenamiento pendiente de guardar" })
      .getByText("Entrenamiento pendiente de sincronizar", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  expect(network.lostResponses.has("/api/workouts/sync")).toBe(false);
  expect(network.blocked.delete("/api/workouts/sync")).toBe(true);
  await page.reload();
  await expect(page.getByText("¡Entrenamiento guardado!", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("8/10", { exact: true })).toBeVisible();
  await expect(page.getByText("Buen ritmo, última serie exigente.", { exact: true })).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const { data, error } = await admin()
    .from("workouts")
    .select("perceived_effort,note,workout_sets(count)")
    .eq("id", id)
    .single();
  expect(error).toBeNull();
  expect(data).toMatchObject({
    perceived_effort: 8,
    note: "Buen ritmo, última serie exigente.",
    workout_sets: [{ count: 1 }],
  });
});
