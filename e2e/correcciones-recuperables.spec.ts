import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { admin, createUser, resetAll, seedCoach } from "./support/db";
import { login } from "./support/ui";
let studentId: string, exerciseId: string, id: string;
const email = "web-correction@iron-strength.e2e.test",
  password = "Web-atomic-local-2026!";
test.beforeAll(async () => {
  await resetAll();
  const coach = await seedCoach();
  studentId = await createUser(admin(), {
    role: "student",
    name: "Alumno web",
    email,
    password,
    coachId: coach,
  });
  const e = await admin()
    .from("exercises")
    .select("id")
    .eq("name", "Sentadilla")
    .is("coach_id", null)
    .single();
  if (e.error) throw e.error;
  exerciseId = e.data.id;
});
test.afterAll(async () => {
  await resetAll();
});
test.beforeEach(async () => {
  id = randomUUID();
  const w = await admin()
    .from("workouts")
    .insert({
      id,
      student_id: studentId,
      started_at: new Date(Date.now() - 600000).toISOString(),
      finished_at: new Date().toISOString(),
      duration_seconds: 600,
    });
  if (w.error) throw w.error;
  const s = await admin()
    .from("workout_sets")
    .insert(
      [1, 2].map((set_number) => ({
        workout_id: id,
        student_id: studentId,
        exercise_id: exerciseId,
        exercise_name: "Sentadilla",
        position: 0,
        set_number,
        weight_kg: 60,
        reps: 8,
      })),
    );
  if (s.error) throw s.error;
});
test("corrección web recupera texto, revisa, guarda una transacción y permite corregir otra vez", async ({
  page,
}) => {
  await login(page, email, password);
  await page.goto(`/history/${id}/edit`);
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)", { exact: true }).fill("62,");
  await expect(page.getByLabel("Estado de corrección", { exact: true })).toHaveText(
    "Guardado en este dispositivo",
  );
  await page.reload();
  await expect(
    page.getByLabel("Peso de la serie 1 de Sentadilla (kg)", { exact: true }),
  ).toHaveValue("62,");
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)", { exact: true }).fill("62,5");
  await page.getByRole("button", { name: "Revisar corrección", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
  await expect(page.getByText("Corrección confirmada", { exact: true })).toBeVisible();
  const s = await admin()
    .from("workout_sets")
    .select("weight_kg")
    .eq("workout_id", id)
    .eq("set_number", 1)
    .single();
  expect(s.data?.weight_kg).toBe(62.5);
  await page.getByRole("button", { name: "Ver resultado", exact: true }).click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(
    page.getByLabel("Peso de la serie 1 de Sentadilla (kg)", { exact: true }),
  ).toHaveValue("62,5");
});
test("salida protege la propuesta y Cuenta/Historial permiten recuperarla", async ({ page }) => {
  await login(page, email, password);
  await page.goto(`/history/${id}/edit`);
  await page.getByLabel("Repeticiones de la serie 1 de Sentadilla", { exact: true }).fill("9");
  await expect(page.getByLabel("Estado de corrección", { exact: true })).toHaveText(
    "Guardado en este dispositivo",
  );
  await page.goto("/account");
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).last().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(/Revisa la corrección o eliminación pendiente/)).toBeVisible();
  await page.getByRole("button", { name: "Volver sin cerrar sesión", exact: true }).click();
  await page.getByRole("button", { name: "Retomar corrección", exact: true }).click();
  await expect(
    page.getByLabel("Repeticiones de la serie 1 de Sentadilla", { exact: true }),
  ).toHaveValue("9");
});
test("borrar usa revisión y confirmación propia; contraste y ancho360", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page, email, password);
  await page.goto(`/history/${id}/remove`);
  await expect(page.getByText("2 series · 0 comentarios", { exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Eliminar para siempre", exact: true }).click();
  await expect(page.getByText("Entrenamiento eliminado", { exact: true })).toBeVisible();
  expect((await admin().from("workouts").select("id").eq("id", id)).data).toEqual([]);
});
for (const operation of ["edit", "remove"] as const) {
  test(`${operation}: respuesta perdida tras commit, recarga e intento idéntico sin duplicados`, async ({
    page,
  }) => {
    await login(page, email, password);
    const path = `/history/${id}/${operation}`;
    await page.goto(path);
    const bodies: string[] = [];
    let lost = true;
    await page.route("**" + path, async (route) => {
      if (route.request().method() !== "POST" || !route.request().headers()["next-action"])
        return route.fallback();
      bodies.push(route.request().postData()!);
      const response = await route.fetch();
      await response.body();
      if (lost) {
        lost = false;
        await route.abort("failed");
      } else await route.fulfill({ response });
    });
    if (operation === "edit") {
      await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)", { exact: true }).fill("67,5");
      await page.getByRole("button", { name: "Revisar corrección", exact: true }).click();
      await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
    } else await page.getByRole("button", { name: "Eliminar para siempre", exact: true }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /No pudimos confirmar/ })
        .first(),
    ).toBeVisible();
    expect(bodies).toHaveLength(1);
    await page.reload();
    await page
      .getByRole("button", {
        name:
          operation === "edit" ? "Reintentar el mismo envío" : "Reintentar la misma eliminación",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(operation === "edit" ? "Corrección confirmada" : "Entrenamiento eliminado", {
        exact: true,
      }),
    ).toBeVisible();
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
    const receipts = await admin()
      .from("workout_correction_receipts")
      .select("request_id")
      .eq("workout_id", id);
    expect(receipts.error).toBeNull();
    expect(receipts.data).toHaveLength(1);
  });
}
test("conflicto web muestra métricas actuales y conserva propuesta antes de aceptar revisión", async ({
  page,
}) => {
  await login(page, email, password);
  await page.goto(`/history/${id}/edit`);
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)", { exact: true }).fill("65");
  await page.getByRole("button", { name: "Revisar corrección", exact: true }).click();
  const remote = await admin()
    .from("workout_sets")
    .update({ weight_kg: 80 })
    .eq("workout_id", id)
    .eq("set_number", 1);
  if (remote.error) throw remote.error;
  await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
  await page.getByRole("button", { name: "Comparar con versión actual", exact: true }).click();
  await expect(page.getByText(/^Actual: 80 kg/)).toBeVisible();
  await expect(page.getByText(/^Propuesta: 65 kg/)).toBeVisible();
  await page.getByRole("button", { name: "Aceptar versión revisada", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
  await expect(page.getByText("Corrección confirmada", { exact: true })).toBeVisible();
  const row = await admin()
    .from("workout_sets")
    .select("weight_kg")
    .eq("workout_id", id)
    .eq("set_number", 1)
    .single();
  expect(row.data?.weight_kg).toBe(65);
});
test("cuota al preparar salida sin propuesta conserva sesión y permite reintentar almacenamiento", async ({
  page,
}) => {
  await login(page, email, password);
  await page.goto("/account");
  const key = `is:workout-removal:v1:${studentId}`;
  await page.evaluate((key) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key && !localStorage.getItem("allow-exit-storage")) throw Error("quota");
      return set.call(this, k, v);
    };
  }, key);
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).last().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Volver sin cerrar sesión", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Guardar intento en este dispositivo", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => localStorage.setItem("allow-exit-storage", "1"));
  await page
    .getByRole("button", { name: "Guardar intento en este dispositivo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Eliminación pendiente", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).last().click();
  await expect(page).toHaveURL(/\/login/);
  expect((await admin().from("workouts").select("id").eq("id", id)).data).toHaveLength(1);
});
