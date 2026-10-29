import type { Database } from "../src/types/database";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { admin, resetAll, seedCoach, createUser } from "./support/db";
import { login } from "./support/ui";
import { addDays, mondayOf, santiagoDate } from "../src/domain/dates";
import { defaultPrescriptionInput, parsePrescriptionInput } from "../src/domain/prescription-input";
import { trainingMetricCases } from "../src/test/fixtures/training-metrics";
const account = {
  email: "web-typed@iron-strength.e2e.test",
  password: "Web-typed-local-only-2026!",
  name: "Alumno",
};
let sessionId: string, owner: string;
test.beforeEach(async () => {
  await resetAll();
  const coachId = await seedCoach();
  owner = await createUser(admin(), { ...account, role: "student", coachId });
  const programId = randomUUID(),
    group = randomUUID(),
    start = mondayOf(santiagoDate(new Date()));
  sessionId = randomUUID();
  expect(
    (
      await admin()
        .from("programs")
        .insert({
          id: programId,
          coach_id: coachId,
          student_id: owner,
          name: "Web mixta",
          weeks_count: 2,
          start_date: start,
          ends_on: addDays(start, 13),
        })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin().from("program_sessions").insert({
        id: sessionId,
        program_id: programId,
        week_number: 1,
        label: "A",
        title: "Sesión mixta",
      })
    ).error,
  ).toBeNull();
  const rows: Database["public"]["Tables"]["session_exercises"]["Insert"][] = [];
  for (const [i, m] of trainingMetricCases.entries()) {
    const exerciseId = randomUUID();
    expect(
      (
        await admin()
          .from("exercises")
          .insert({
            id: exerciseId,
            coach_id: coachId,
            name: `Web tipo ${i}`,
            muscle_group: "Core",
            record_type: m.recordType,
          })
      ).error,
    ).toBeNull();
    const goal = {
      ...parsePrescriptionInput(defaultPrescriptionInput(m.recordType)),
      sets: i === 0 ? 2 : 1,
    };
    rows.push({
      program_session_id: sessionId,
      exercise_id: exerciseId,
      position: i,
      sets: goal.sets,
      reps_min: null,
      reps_max: null,
      typed_prescription: goal,
      note: `Indicación ${i}`,
      rest_seconds: 30,
      superset_id: i < 2 ? group : null,
      superset_rest_seconds: i < 2 ? 45 : null,
    });
  }
  expect((await admin().from("session_exercises").insert(rows)).error).toBeNull();
});
test.afterAll(async () => {
  await resetAll();
});
async function start(page: Page) {
  await login(page, account.email, account.password);
  await page.goto(`/workout/${sessionId}`);
  await expect(page.getByRole("heading", { name: "Web tipo 0", exact: true })).toBeVisible();
}
async function fill(page: Page, i: number) {
  await page.getByRole("button", { name: `Ir a Web tipo ${i}`, exact: true }).click();
  const row = page.getByRole("region", { name: `Web tipo ${i}`, exact: true }),
    m = trainingMetricCases[i];
  if (m.weightKg !== null)
    await row.getByRole("textbox", { name: new RegExp("KG.*serie 1$") }).fill(String(m.weightKg));
  if (m.reps !== null)
    await row.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill(String(m.reps));
  if (m.durationSeconds !== null)
    await row
      .getByRole("textbox", { name: "SEGUNDOS serie 1", exact: true })
      .fill(String(m.durationSeconds));
  if (m.distanceMeters !== null)
    await row
      .getByRole("textbox", { name: "METROS serie 1", exact: true })
      .fill(String(m.distanceMeters));
  await row.getByRole("button", { name: "Completar serie 1", exact: true }).click();
}
test("consulta sin iniciar, registra nueve dimensiones y revisa el resultado real", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => localStorage.setItem("is:theme:v1", "dark"));
  await login(page, account.email, account.password);
  await page.goto("/week");
  await page.getByRole("button", { name: "Ver rutina de sesión A", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Web tipo 8");
  expect(
    await page.evaluate((id) => localStorage.getItem(`is:native-training:v1:${id}`), owner),
  ).toBeNull();
  await page.getByRole("button", { name: "Cerrar vista previa" }).click();
  await page.goto(`/workout/${sessionId}`);
  await expect(page.getByRole("heading", { name: "Web tipo 0", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "dark");
  expect(
    await page
      .getByLabel("Duración del entrenamiento")
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThan(34);
  for (let i = 0; i < trainingMetricCases.length; i++) await fill(page, i);
  await page.screenshot({ path: info.outputPath("web-typed-dark-360.png"), fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Terminar entrenamiento", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Cerrar entrenamiento" });
  await expect(dialog).toContainText("9 series realizadas");
  await expect(dialog).toContainText("1 pendiente");
  await dialog.getByLabel("Nota del entrenamiento").fill("Registro web completo");
  await dialog.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
  await expect(page.getByText("Guardado en tu cuenta", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ver resultado", exact: true }).click();
  await expect(page).toHaveURL(/\/history\//);
  const workouts = await admin()
    .from("workouts")
    .select(
      "id,note,workout_sets(position,record_type,weight_kg,reps,duration_seconds,distance_meters)",
    )
    .eq("student_id", owner);
  expect(workouts.data).toHaveLength(1);
  expect(workouts.data![0].note).toBe("Registro web completo");
  expect(
    workouts
      .data![0].workout_sets.toSorted((a, b) => a.position - b.position)
      .map((s) => ({
        recordType: s.record_type,
        weightKg: s.weight_kg,
        reps: s.reps,
        durationSeconds: s.duration_seconds,
        distanceMeters: s.distance_meters,
      })),
  ).toEqual(trainingMetricCases);
  await page.goto(`/workout/${sessionId}`);
  await page.getByRole("button", { name: "Empezar otra sesión", exact: true }).click();
  const row = page.getByRole("region", { name: "Web tipo 0", exact: true });
  await expect(
    row.getByRole("button", { name: "Copiar anterior a serie 1", exact: true }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Copiar anterior a serie 1", exact: true }).click();
  await expect(row.getByRole("textbox", { name: "REPS serie 1", exact: true })).toHaveValue("8");
  await row.getByRole("button", { name: "Completar serie 1", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Copiar anterior a serie 1", exact: true }),
  ).toBeDisabled();
  await row.getByRole("button", { name: "Detalles de Web tipo 0", exact: true }).click();
  await expect(row.getByRole("heading", { name: "Historial del ejercicio" })).toBeVisible();
  await expect(row.getByRole("listitem").filter({ hasText: /30 kg/ })).toBeVisible();
});
test("recupera texto, pausa y descanso; cierre sin conexión vuelve a semana y se confirma una sola vez", async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => localStorage.setItem("is:theme:v1", "light"));
  await start(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "light");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await fill(page, 0);
  await fill(page, 1);
  await expect(page.getByRole("timer")).toBeVisible();
  const before = await page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem(`is:native-training:v1:${id}`)!).active.draft.rest.endsAt,
    owner,
  );
  await page.reload();
  await expect(page.getByRole("timer")).toBeVisible();
  expect(
    await page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem(`is:native-training:v1:${id}`)!).active.draft.rest.endsAt,
      owner,
    ),
  ).toBe(before);
  await page.getByRole("button", { name: "Pausar entrenamiento", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reanudar entrenamiento", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reanudar entrenamiento", exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath("web-typed-light-360.png"), fullPage: true });
  await context.setOffline(true);
  await page.getByRole("button", { name: "Terminar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
  await expect(page.getByText("Pendiente de enviar", { exact: true })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Volver a mi semana", exact: true }).click();
  const pending = page.getByRole("region", { name: "Registro tipado en este dispositivo" });
  await expect(pending.getByText("Guardado en tu cuenta", { exact: true })).toBeVisible();
  expect((await admin().from("workouts").select("id").eq("student_id", owner)).data).toHaveLength(
    1,
  );
});
test("cerrar sesión conserva el activo hasta descartar explícitamente y limpia solo su cuenta", async ({
  page,
}) => {
  await start(page);
  await fill(page, 0);
  const raw = await page.evaluate(
    (id) => localStorage.getItem(`is:native-training:v1:${id}`),
    owner,
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "is:native-training:v1:00000000-0000-4000-8000-000000000999",
      "other-account",
    ),
  );
  await page.goto("/account");
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Antes de cerrar sesión" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Volver sin cerrar sesión" }).click();
  expect(
    await page.evaluate((id) => localStorage.getItem(`is:native-training:v1:${id}`), owner),
  ).toBe(raw);
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).first().click();
  await dialog.getByRole("button", { name: "Eliminar pendientes locales y salir" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(
    await page.evaluate((id) => localStorage.getItem(`is:native-training:v1:${id}`), owner),
  ).toBeNull();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("is:native-training:v1:00000000-0000-4000-8000-000000000999"),
    ),
  ).toBe("other-account");
});
test("el origen eliminado no impide recuperar; un rechazo conserva el cierre sin fingir resultado", async ({
  page,
}) => {
  await start(page);
  await fill(page, 0);
  const before = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem(`is:native-training:v1:${id}`)!).active.draft.workoutId,
    owner,
  );
  expect((await admin().from("program_sessions").delete().eq("id", sessionId)).error).toBeNull();
  await page.reload();
  const row = page.getByRole("region", { name: "Web tipo 0", exact: true });
  await expect(row.getByRole("button", { name: "Desmarcar serie 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Terminar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
  await expect(page.getByText("Pendiente de enviar", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "origen ya no está disponible" }),
  ).toBeVisible();
  const frozen = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem(`is:native-sync:v1:${id}`)!).entries[0].payload,
    owner,
  );
  expect(frozen.id).toBe(before);
  await page.reload();
  await page.getByRole("button", { name: "Reintentar envío", exact: true }).click();
  expect(
    await page.evaluate(
      (id) => JSON.parse(localStorage.getItem(`is:native-sync:v1:${id}`)!).entries[0].payload,
      owner,
    ),
  ).toEqual(frozen);
  await expect(page.getByRole("button", { name: "Ver resultado", exact: true })).toHaveCount(0);
  expect((await admin().from("workouts").select("id").eq("student_id", owner)).data).toEqual([]);
});
