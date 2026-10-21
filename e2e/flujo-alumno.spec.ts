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

test("el cierre explica pendientes y solo confirma el envío después del servidor", async ({
  page,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  await seedProgram({ coachId, studentId: coachId });
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("60");
  await page
    .getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla", exact: true })
    .click();
  await page.getByRole("button", { name: "Terminar entrenamiento", exact: true }).click();
  const closing = page.getByRole("alertdialog", {
    name: "Confirmar el fin del entrenamiento",
    exact: true,
  });
  await expect(closing.getByRole("list", { name: "Series por ejercicio" })).toContainText(
    "Sentadilla: 1 hecha · 2 pendientes",
  );
  await expect(closing).toContainText("Press de banca: 0 hechas · 3 pendientes");
  await page.route("**/api/workouts/sync", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, reason: "forbidden" }),
    }),
  );
  await closing.getByRole("button", { name: "Sí, finalizar", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Entrenamiento pendiente de guardar", exact: true }),
  ).toContainText("Pendiente de enviar");
  await expect(page.getByText("Tu coach ya puede ver cómo te fue.")).toHaveCount(0);
  await page.getByRole("button", { name: "Volver a Mi semana", exact: true }).click();
  const panel = page.getByRole("region", { name: "Sincronización de entrenamientos", exact: true });
  await expect(panel).toContainText("Tu cuenta no tiene permiso");
  await expect(page.locator("[data-pending-workout]")).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Entrenamientos en este dispositivo", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/workouts/sync");
  await expect(panel.getByRole("button", { name: "Sincronizar ahora", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Sincronizar ahora", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Entrenamiento sincronizado.");
  await expect(page.locator("[data-pending-workout]")).toHaveCount(0);
  await panel.getByRole("link", { name: "Ver entrenamiento", exact: true }).click();
  await expect(page.getByText("Tu coach ya puede ver cómo te fue.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Volver a mi semana", exact: true })).toBeVisible();
  const saved = await admin().from("workouts").select("id").eq("student_id", coachId);
  expect(saved.data).toHaveLength(1);
});

test("Retomar tiene prioridad aunque el borrador sea de otra sesión de la semana", async ({
  page,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const seeded = await seedProgram({ coachId, studentId: coachId });
  const session = await admin()
    .from("program_sessions")
    .insert({ program_id: seeded.programId, week_number: 1, label: "B", position: 1 })
    .select("id")
    .single();
  expect(session.error).toBeNull();
  expect(
    (
      await admin()
        .from("session_exercises")
        .insert({
          program_session_id: session.data!.id,
          exercise_id: seeded.exercises.get("Sentadilla")!,
          position: 0,
          sets: 2,
          reps_min: 8,
          reps_max: 12,
        })
    ).error,
  ).toBeNull();
  await login(page, COACH.email, COACH.password);
  await page.goto(`/workout/${session.data!.id}`);
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("55");
  await page.getByRole("button", { name: /Volver a Mi semana/ }).click();
  const hero = page.getByRole("region", { name: "Próxima sesión", exact: true });
  await expect(hero).toContainText("Sesión B");
  await expect(hero.getByRole("button", { name: "Retomar", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retomar", exact: true })).toHaveCount(1);
});

test("si IndexedDB falla el pendiente local sigue siendo revisable y se puede enviar con conexión", async ({
  page,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const seeded = await seedProgram({ coachId, studentId: coachId });
  await page.addInitScript(() => {
    Object.defineProperty(IDBFactory.prototype, "open", {
      configurable: true,
      value() {
        throw new DOMException("Almacenamiento no disponible", "InvalidStateError");
      },
    });
  });
  await login(page, COACH.email, COACH.password);
  await page.goto(`/workout/${seeded.sessionId}`);
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("60");
  await page
    .getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla", exact: true })
    .click();
  await page.route("**/api/workouts/sync", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, reason: "forbidden" }),
    }),
  );
  await page.getByRole("button", { name: "Terminar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Sí, finalizar", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Entrenamiento pendiente de guardar", exact: true }),
  ).toContainText("Pendiente de enviar");
  await page.getByRole("button", { name: "Volver a Mi semana", exact: true }).click();
  const pending = page.locator("[data-pending-workout]");
  await expect(pending).toHaveCount(1);
  await expect(pending).toContainText("guardado en este dispositivo");
  await page.unroute("**/api/workouts/sync");
  await pending.getByRole("button", { name: "Revisar envío", exact: true }).click();
  await expect(page.getByText("¡Entrenamiento guardado!", { exact: true })).toBeVisible();
  expect((await admin().from("workouts").select("id").eq("student_id", coachId)).data).toHaveLength(
    1,
  );
});
