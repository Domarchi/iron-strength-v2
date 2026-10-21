import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { admin, COACH, resetAll, seedCoach, seedProgram } from "./support/db";
import { login } from "./support/ui";

test("consulta la rutina sin iniciar ni crear un borrador", async ({ page }) => {
  await resetAll();
  const coachId = await seedCoach();
  await seedProgram({ coachId, studentId: coachId });
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  const keys = () =>
    page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("is:draft:")));
  expect(await keys()).toEqual([]);
  await page.getByRole("button", { name: "Ver rutina de sesión A", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Rutina de sesión A", exact: true });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Sentadilla", exact: true })).toBeVisible();
  await expect(preview).toContainText("3 × 8–12");
  expect(await keys()).toEqual([]);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
  }
  await page.screenshot({ path: test.info().outputPath("consulta-rutina.png"), fullPage: true });
  await preview.getByRole("button", { name: "Cerrar vista previa" }).click();
  await expect(preview).not.toBeVisible();
  expect(await keys()).toEqual([]);
  const { count } = await admin()
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", coachId);
  expect(count).toBe(0);
});

test("la tarjeta principal retoma el mismo entrenamiento en curso", async ({ page }) => {
  await resetAll();
  const coachId = await seedCoach();
  await seedProgram({ coachId, studentId: coachId });
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("65");
  const original = await page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("is:draft:v2:"))!)!,
      ).draft.workoutId,
  );
  await page.getByRole("button", { name: /Volver a Mi semana/ }).click();
  const next = page.getByRole("region", { name: "Próxima sesión", exact: true });
  await expect(next.getByRole("button", { name: "Retomar", exact: true })).toBeVisible();
  await expect(next).toContainText("En curso · guardado en este dispositivo");
  await next.getByRole("button", { name: "Retomar", exact: true }).click();
  await expect(page.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toHaveValue("65");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem(
            Object.keys(localStorage).find((k) => k.startsWith("is:draft:v2:"))!,
          )!,
        ).draft.workoutId,
    ),
  ).toBe(original);
});

test("el índice cambia y recupera el ejercicio sin alterar las series", async ({ page }) => {
  await resetAll();
  const coachId = await seedCoach();
  await seedProgram({ coachId, studentId: coachId });
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("65");
  const index = page.getByRole("navigation", { name: "Ejercicios del entrenamiento" });
  await index.getByRole("button", { name: "Ir a Press de banca", exact: true }).click();
  await expect(page.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toHaveCount(0);
  await page.getByLabel("Peso de la serie 1 de Press de banca (kg)").fill("42,5");
  await page.reload();
  await expect(
    index.getByRole("button", { name: "Ir a Press de banca", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Peso de la serie 1 de Press de banca (kg)")).toHaveValue("42,5");
  await index.getByRole("button", { name: "Ir a Sentadilla", exact: true }).click();
  await expect(page.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toHaveValue("65");
  await expect(page.getByRole("progressbar", { name: "Avance de la sesión" })).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  const activeButton = index.getByRole("button", { name: "Ir a Sentadilla", exact: true });
  await expect(activeButton).toHaveCSS("background-color", "rgb(129, 188, 255)");
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
  await page.getByLabel("Repeticiones de la serie 1 de Sentadilla", { exact: true }).fill("8");
  await page
    .getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla", exact: true })
    .click();
  const restEnd = () =>
    page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem(
            Object.keys(localStorage).find((k) => k.startsWith("is:draft:v2:"))!,
          )!,
        ).draft.rest.endsAt,
    );
  const deadline = await restEnd();
  await index.getByRole("button", { name: "Ir a Press de banca", exact: true }).click();
  await page.reload();
  expect(await restEnd()).toBe(deadline);
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByLabel("Peso de la serie 1 de Press de banca (kg)").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 450));
  await expect.poll(() => index.evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(130);
  expect(await index.evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(40);
  await page.screenshot({ path: test.info().outputPath("ejercicio-actual.png"), fullPage: true });
});

test("el bloque de superserie conserva ronda, siguiente y descanso al recargar", async ({
  page,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const seeded = await seedProgram({ coachId, studentId: coachId });
  const updated = await admin()
    .from("session_exercises")
    .update({ superset_id: crypto.randomUUID(), superset_rest_seconds: 90 })
    .eq("program_session_id", seeded.sessionId);
  expect(updated.error).toBeNull();
  await login(page, COACH.email, COACH.password);
  await page.goto(`/workout/${seeded.sessionId}`);
  for (let round = 1; round <= 3; round++) {
    await expect(
      page.getByRole("status").filter({ hasText: `Ronda ${round} · Ahora:` }),
    ).toBeVisible();
    for (const name of ["Sentadilla", "Press de banca"]) {
      await page
        .getByLabel(`Peso de la serie ${round} de ${name} (kg)`)
        .fill(name === "Sentadilla" ? "60" : "40");
      await page
        .getByLabel(`Repeticiones de la serie ${round} de ${name}`, { exact: true })
        .fill("8");
      await page
        .getByRole("button", {
          name: `Marcar como hecha la serie ${round} de ${name}`,
          exact: true,
        })
        .click();
      if (round === 1 && name === "Sentadilla") {
        await expect(page.getByRole("timer")).toHaveCount(0);
        await page.reload();
        await expect(
          page.getByRole("status").filter({ hasText: "Ronda 1 · Ahora: Press de banca" }),
        ).toBeVisible();
      }
    }
    await expect(page.getByRole("timer")).toBeVisible();
  }
  await expect(page.getByRole("progressbar", { name: "Avance de la sesión" })).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
});
