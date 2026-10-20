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
import { addDays, mondayOf, santiagoDate } from "../src/domain/dates";
test("filtra tres alumnos, abre evidencia y excluye la descarga de inactividad (T157)", async ({
  page,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const ids = [];
  for (const [i, name] of ["Ana panel", "Bea panel", "Cata panel"].entries())
    ids.push(
      await createUser(admin(), {
        role: "student",
        name,
        email: `panel-${i}@iron-strength.e2e.test`,
        password: "Prueba-local-2026!",
        coachId,
      }),
    );
  const start = addDays(mondayOf(santiagoDate(new Date())), -7);
  const ana = await seedProgram({ coachId, studentId: ids[0] });
  const cata = await seedProgram({ coachId, studentId: ids[2] });
  expect(
    (
      await admin()
        .from("programs")
        .update({ start_date: start, ends_on: addDays(start, 13) })
        .in("id", [ana.programId, cata.programId])
    ).error,
  ).toBeNull();
  expect(
    (await admin().from("program_sessions").update({ week_number: 2 }).eq("id", ana.sessionId))
      .error,
  ).toBeNull();
  const workoutId = await seedWorkout({
    studentId: ids[0],
    exerciseId: ana.exercises.get("Sentadilla")!,
    exerciseName: "Sentadilla",
    daysAgo: 8,
  });
  expect(
    (
      await admin()
        .from("comments")
        .insert({ workout_id: workoutId, author_id: ids[0], body: "Me costó terminar." })
    ).error,
  ).toBeNull();
  await login(page, COACH.email, COACH.password);
  await page.goto("/coach/students");
  const signals = page.getByRole("region", { name: "Para revisar", exact: true });
  await expect(signals.getByText("Sin programa vigente", { exact: true })).toHaveCount(1);
  await page.getByLabel("Filtrar por alumno", { exact: true }).selectOption(ids[2]);
  await expect(signals.getByText(/días sin entrenar/)).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Fichas de alumnos" })).toContainText("descarga");
  await page.getByLabel("Filtrar por alumno", { exact: true }).selectOption(ids[0]);
  await expect(signals.getByText("1 comentario pendiente", { exact: true })).toBeVisible();
  await expect(signals.getByText(/días sin entrenar/)).toBeVisible();
  await expect(signals.getByText("Termina esta semana", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Fichas de alumnos" }).getByRole("link")).toHaveCount(
    1,
  );
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
  await signals.getByRole("link", { name: /1 comentario pendiente/ }).click();
  await expect(page).toHaveURL(new RegExp(`/history/${workoutId}$`));
  await expect(page.getByText("Me costó terminar.", { exact: true })).toBeVisible();
  await page
    .getByLabel("Escribe un comentario", { exact: true })
    .fill("Revisemos la próxima sesión.");
  await page.getByRole("button", { name: "Publicar comentario", exact: true }).click();
  await expect(page.getByText("Revisemos la próxima sesión.", { exact: true })).toBeVisible();
  await page.goto("/coach/students");
  await expect(
    page
      .getByRole("region", { name: "Para revisar", exact: true })
      .getByText(/comentario pendiente/),
  ).toHaveCount(0);
  await page.getByLabel("Filtrar por alumno", { exact: true }).selectOption(ids[1]);
  await page
    .getByRole("region", { name: "Para revisar", exact: true })
    .getByRole("link", { name: /Sin programa vigente/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/coach/students/${ids[1]}$`));
});
