// T96 · Accesibilidad (WCAG 2.1 AA) con axe-core en las pantallas principales, en modo claro y oscuro.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { admin, createUser, resetAll, seedCoach, seedProgram, seedWorkout } from "./support/db";
import { login } from "./support/ui";

const ANA = { email: "ana-a11y@e2e.test", name: "Ana", password: "Contraseña-E2E-2026!" };
let coachId: string;
let studentId: string;
let programId: string;
let sessionId: string;

test.beforeAll(async () => {
  await resetAll();
  coachId = await seedCoach();
  studentId = await createUser(admin(), { role: "student", ...ANA, coachId });
  const seeded = await seedProgram({ coachId, studentId });
  programId = seeded.programId;
  sessionId = seeded.sessionId;
  await seedWorkout({
    studentId,
    exerciseId: seeded.exercises.get("Sentadilla")!,
    exerciseName: "Sentadilla",
    daysAgo: 3,
  });
});

async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious.map(
      (v) =>
        `${name}: ${v.id} (${v.impact}) → ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
    ),
  ).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`modo ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("pantallas del alumno", async ({ page }) => {
      await page.goto("/login");
      await audit(page, "login");

      await login(page, ANA.email, ANA.password);
      await page.goto("/week");
      await expect(page.getByText("Sesión A")).toBeVisible();
      await audit(page, "mi semana");

      await page.goto(`/workout/${sessionId}`);
      await expect(page.getByText("Finalizar entrenamiento")).toBeVisible();
      await audit(page, "sesión en curso");

      for (const [path, ready] of [
        ["/history", "Historial"],
        ["/progress", "Progreso"],
        ["/body", "Cuerpo"],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: ready, exact: true })).toBeVisible();
        await audit(page, path);
      }
    });

    test("pantallas del coach", async ({ page }) => {
      await login(page, "coach-e2e@test.local", "Local-E2E-only-2026!");
      for (const [path, ready] of [
        ["/coach/students", "Mis alumnos"],
        [`/coach/students/${studentId}`, "Últimos entrenamientos"],
        ["/coach/programs", "Nueva plantilla"],
        [`/coach/programs/${programId}`, "Semana 1"],
        ["/coach/exercises", "Nuevo ejercicio"],
      ] as const) {
        await page.goto(path);
        await expect(page.getByText(ready).first()).toBeVisible();
        await audit(page, path);
      }
    });
  });
}
