import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  admin,
  COACH,
  resetAll,
  seedCoach,
  seedProgram,
  seedWorkout,
  createUser,
} from "./support/db";
import { login } from "./support/ui";
import { addDays, mondayOf, santiagoDate } from "../src/domain/dates";
let studentId: string, otherId: string, programId: string, exerciseId: string, workoutIds: string[];
test.beforeEach(async () => {
  await resetAll();
  const coachId = await seedCoach();
  studentId = await createUser(admin(), {
    role: "student",
    name: "Ana Continuidad",
    email: "continuidad-a@iron-strength.e2e.test",
    password: "Continuidad-2026!",
    coachId,
  });
  otherId = await createUser(admin(), {
    role: "student",
    name: "Bruno Continuidad",
    email: "continuidad-b@iron-strength.e2e.test",
    password: "Continuidad-2026!",
    coachId,
  });
  const first = await seedProgram({ coachId, studentId });
  programId = first.programId;
  exerciseId = first.exercises.get("Sentadilla")!;
  await seedProgram({ coachId, studentId: otherId });
  workoutIds = [];
  for (let i = 0; i < 12; i++)
    workoutIds.push(
      await seedWorkout({ studentId, exerciseId, exerciseName: "Sentadilla", daysAgo: i }),
    );
  expect(
    (
      await admin().from("comments").insert({
        workout_id: workoutIds[11],
        author_id: studentId,
        body: "Consulta pendiente anterior al listado reciente",
      })
    ).error,
  ).toBeNull();
});
test("ficha prioriza evidencia y conserva alumno/periodo/métrica hasta adaptar y asignar otra base", async ({
  page,
}) => {
  await login(page, COACH.email, COACH.password);
  await page.goto(`/coach/students/${studentId}?semanas=12&vista=volumen`);
  const overview = page.getByRole("region", { name: "Resumen del alumno", exact: true });
  await expect(
    overview.getByRole("button", { name: "Abrir programa vigente", exact: true }),
  ).toBeVisible();
  await expect(
    overview.getByRole("button", { name: "Revisar último entrenamiento", exact: true }),
  ).toBeVisible();
  const pending = page.getByRole("region", {
    name: "Comentarios pendientes del alumno",
    exact: true,
  });
  await pending.getByRole("link", { name: /Revisar 1 comentario/ }).click();
  await expect(page).toHaveURL(new RegExp(`/history/${workoutIds[11]}\\?`));
  await expect(
    page.getByText("Consulta pendiente anterior al listado reciente", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Volver a la ficha", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/coach/students/${studentId}\\?`));
  expect(new URL(page.url()).searchParams.get("semanas")).toBe("12");
  await page.getByRole("link", { name: /^Sentadilla/ }).click();
  await expect(page).toHaveURL(new RegExp(`/progress/${exerciseId}\\?`));
  expect(new URL(page.url()).searchParams.get("alumno")).toBe(studentId);
  expect(new URL(page.url()).searchParams.get("vista")).toBe("volumen");
  await expect(
    page
      .getByRole("navigation", { name: "Periodo de progreso", exact: true })
      .getByRole("link", { name: "12 semanas", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("region", { name: "Entrenamientos del periodo", exact: true })
    .getByRole("link")
    .first()
    .click();
  await page.getByRole("button", { name: "Volver al progreso", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/progress/${exerciseId}\\?`));
  expect(new URL(page.url()).searchParams.get("semanas")).toBe("12");
  await page.getByRole("button", { name: "Volver a la ficha", exact: true }).click();
  await overview.getByRole("button", { name: "Abrir programa vigente", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/coach/programs/${programId}\\?`));
  await page.getByRole("button", { name: "Volver a la ficha", exact: true }).click();
  await page.getByRole("button", { name: "Asignar un programa", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Adaptar una base", exact: true })).toBeVisible();
  await page.getByLabel("Buscar una base", { exact: true }).fill("Bruno");
  const base = page.getByRole("listitem").filter({ hasText: "Bruno Continuidad" });
  await expect(base).toContainText("Programa semilla");
  await base.getByRole("button", { name: "Usar Programa semilla", exact: true }).click();
  await page.getByLabel("Nombre de la copia", { exact: true }).fill("Base para Ana con contexto");
  await page.getByRole("button", { name: "Crear copia", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Base para Ana con contexto", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("alumno")).toBe(studentId);
  expect(new URL(page.url()).searchParams.get("semanas")).toBe("12");
  await page.getByText("Asignar a un alumno", { exact: true }).click();
  await expect(page.getByLabel("Alumno", { exact: true })).toHaveValue(studentId);
  await page
    .getByLabel("Inicio", { exact: true })
    .fill(addDays(mondayOf(santiagoDate(new Date())), 7));
  await page.getByRole("button", { name: "Revisar asignación", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Vista previa de asignación", exact: true }),
  ).toBeVisible();
  const changes = page.getByRole("checkbox", {
    name: "Confirmo los cambios en los programas existentes",
    exact: true,
  });
  if (await changes.count()) await changes.check();
  const copyPath = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Confirmar asignación", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(copyPath);
  const assignedId = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(
    (await admin().from("programs").select("student_id").eq("id", assignedId).single()).data
      ?.student_id,
  ).toBe(studentId);
  await expect(
    page.getByRole("heading", { name: "Base para Ana con contexto", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("semanas")).toBe("12");
  await page.getByRole("button", { name: "Volver a la ficha", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ana Continuidad", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Base para Ana con contexto/ })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    if (colorScheme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
    else await expect(page.locator("html")).not.toHaveClass(/dark/);
    // Contrastar el tema aplicado: las transiciones de color pueden seguir
    // interpolando después del cambio de clase. Esperar su final real.
    await page.evaluate(async () => {
      document.documentElement.getBoundingClientRect();
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation instanceof CSSTransition)
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    expect(
      (
        await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
      ).violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
});
test("el resultado usa su propietario real y rechaza un retorno/ejercicio ajeno por query", async ({
  page,
}) => {
  await login(page, COACH.email, COACH.password);
  await page.goto(
    `/history/${workoutIds[0]}?alumno=${otherId}&desde=progreso&ejercicio=${crypto.randomUUID()}&semanas=999&vista=https://evil.test&returnTo=https://evil.test`,
  );
  const back = page.getByRole("button", { name: "Volver a la ficha", exact: true });
  await expect(back).toHaveAttribute("href", `/coach/students/${studentId}`);
  await expect(page.locator('a[href^="https://evil.test"]')).toHaveCount(0);
  await back.click();
  await expect(page.getByRole("heading", { name: "Ana Continuidad", exact: true })).toBeVisible();
});
