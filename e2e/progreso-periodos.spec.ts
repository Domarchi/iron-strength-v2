import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  COACH,
  admin,
  createUser,
  resetAll,
  seedCoach,
  seedProgram,
  seedWorkout,
} from "./support/db";
import { login } from "./support/ui";
test("periodos equivalentes, enlaces a evidencia y valoración en ficha del alumno (T158)", async ({
  page,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const studentId = await createUser(admin(), {
    role: "student",
    name: "Ana progreso",
    email: "progreso@iron-strength.e2e.test",
    password: "Prueba-local-2026!",
    coachId,
  });
  const program = await seedProgram({ coachId, studentId });
  const exerciseId = program.exercises.get("Sentadilla")!;
  const ids = [];
  for (const daysAgo of [0, 10, 40, 70, 100])
    ids.push(await seedWorkout({ studentId, exerciseId, exerciseName: "Sentadilla", daysAgo }));
  expect(
    (
      await admin()
        .from("workouts")
        .update({ perceived_effort: 8, note: "Controlé mejor la bajada." })
        .eq("id", ids[0])
    ).error,
  ).toBeNull();
  await login(page, COACH.email, COACH.password);
  await page.goto(`/coach/students/${studentId}`);
  await expect(page.getByText("Esfuerzo: 8/10", { exact: true })).toBeVisible();
  await expect(page.getByText("Controlé mejor la bajada.", { exact: true })).toBeVisible();
  await page.goto(`/progress/${exerciseId}?alumno=${studentId}`);
  const periods = page.getByRole("navigation", { name: "Periodo de progreso", exact: true });
  const current = page.getByRole("region", { name: "Entrenamientos del periodo", exact: true });
  await expect(periods.getByRole("link", { name: "8 semanas", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(current.getByRole("link")).toHaveCount(3);
  await periods.getByRole("link", { name: "4 semanas", exact: true }).click();
  await expect(current.getByRole("link")).toHaveCount(2);
  await page.getByRole("link", { name: "Volumen", exact: true }).click();
  await expect(periods.getByRole("link", { name: "4 semanas", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page
      .getByRole("region", { name: "Comparación de periodos", exact: true })
      .getByText("+100 %", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`alumno=${studentId}`));
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  for (const link of await current.getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
  await page.getByText("Ver entrenamientos del periodo anterior", { exact: true }).click();
  await page.locator(`a[href="/history/${ids[2]}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/history/${ids[2]}$`));
  await page.goto(`/progress/${exerciseId}?alumno=${studentId}&semanas=12`);
  await expect(
    page.getByRole("region", { name: "Entrenamientos del periodo", exact: true }).getByRole("link"),
  ).toHaveCount(4);
});
