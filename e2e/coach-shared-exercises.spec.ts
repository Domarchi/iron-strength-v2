import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { admin, COACH, resetAll, seedCoach } from "./support/db";
import { login } from "./support/ui";
import { RECORD_TYPES } from "../src/domain/training-metrics";
import { readStoredTrainingPrescription } from "../src/domain/stored-prescription";
test.setTimeout(150_000);
let coachId: string;
test.beforeEach(async () => {
  await resetAll();
  coachId = await seedCoach();
});
test("el coach crea ocho tipos explícitos y los usa con sus dimensiones reales en la rutina", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, COACH.email, COACH.password);
  await page.goto("/coach/exercises");
  const form = page.getByRole("form", { name: "Crear ejercicio", exact: true });
  await expect(form.getByLabel("Tipo de registro", { exact: true }).locator("option")).toHaveCount(
    8,
  );
  await form.getByLabel("Nombre", { exact: true }).fill("Conservar al fallar");
  await form.getByLabel("Incremento de carga (kg)", { exact: true }).fill("0");
  await form.getByRole("button", { name: "Crear ejercicio", exact: true }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByLabel("Nombre", { exact: true })).toHaveValue("Conservar al fallar");
  await expect(form.getByLabel("Incremento de carga (kg)", { exact: true })).toHaveValue("0");
  for (const recordType of RECORD_TYPES) {
    await form.getByLabel("Nombre", { exact: true }).fill(`Compartido ${recordType}`);
    await form.getByLabel("Tipo de registro", { exact: true }).selectOption(recordType);
    await form.getByLabel("Grupo muscular", { exact: true }).selectOption("Core");
    await form.getByLabel("Equipamiento", { exact: true }).selectOption("Peso corporal");
    const load =
      recordType !== "duration" &&
      recordType !== "distance_duration" &&
      recordType !== "bodyweight_reps";
    if (load) await form.getByLabel("Incremento de carga (kg)", { exact: true }).fill("2.5");
    else await expect(form.getByLabel("Incremento de carga (kg)", { exact: true })).toHaveCount(0);
    await form.getByRole("button", { name: "Crear ejercicio", exact: true }).click();
    await expect(form.getByRole("status")).toHaveText("Ejercicio guardado.");
    await expect(form.getByLabel("Nombre", { exact: true })).toHaveValue("");
  }
  const created = await admin()
    .from("exercises")
    .select("id,name,record_type,personal_owner_id")
    .eq("coach_id", coachId)
    .order("name");
  expect(created.error).toBeNull();
  expect(created.data).toHaveLength(8);
  expect(created.data!.map((row) => row.record_type).sort()).toEqual([...RECORD_TYPES].sort());
  expect(created.data!.every((row) => row.personal_owner_id === null)).toBe(true);
  await page.goto("/coach/programs");
  await page.getByLabel("Nombre", { exact: true }).fill("Planificar tipos creados");
  await page.getByLabel("Semanas", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Crear plantilla", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Planificar tipos creados", exact: true }),
  ).toBeVisible();
  const programId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("button", { name: "Agregar sesión", exact: true }).click();
  await page.getByLabel("Buscar ejercicios", { exact: true }).fill("Compartido");
  for (const row of created.data!)
    await page
      .getByRole("checkbox", { name: `${row.name} Core · Peso corporal`, exact: true })
      .check();
  await page.getByRole("button", { name: "Agregar seleccionados (8)", exact: true }).click();
  await expect(page.getByText("Ejercicios agregados a la sesión.", { exact: true })).toBeVisible();
  const saved = await admin()
    .from("program_sessions")
    .select("session_exercises(*,exercises(record_type))")
    .eq("program_id", programId)
    .single();
  expect(saved.error).toBeNull();
  expect(saved.data!.session_exercises).toHaveLength(8);
  for (const row of saved.data!.session_exercises)
    expect(readStoredTrainingPrescription(row).recordType).toBe(row.exercises.record_type);
  await expect(page.getByLabel("Reps mín. de Compartido duration", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Tiempo (s) de Compartido duration", { exact: true })).toBeVisible();
  await page.goto("/coach/exercises");
  await page.setViewportSize({ width: 360, height: 800 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBe(0);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter((item) => item.impact === "serious" || item.impact === "critical"),
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`shared-library-${colorScheme}-360.png`),
      fullPage: false,
    });
  }
});
test("crear un compartido no publica el privado homónimo y la edición mantiene el tipo fijo", async ({
  page,
}) => {
  const privateId = crypto.randomUUID(),
    name = "Privado reservado";
  expect(
    (
      await admin().from("exercises").insert({
        id: privateId,
        personal_owner_id: coachId,
        name,
        muscle_group: "Core",
        record_type: "duration",
      })
    ).error,
  ).toBeNull();
  await login(page, COACH.email, COACH.password);
  await page.goto(`/coach/exercises?q=${encodeURIComponent(name)}`);
  await expect(page.getByText("No hay ejercicios con ese filtro.", { exact: true })).toBeVisible();
  const form = page.getByRole("form", { name: "Crear ejercicio", exact: true });
  await form.getByLabel("Nombre", { exact: true }).fill(name);
  await form.getByLabel("Tipo de registro", { exact: true }).selectOption("weight_distance");
  await form.getByRole("button", { name: "Crear ejercicio", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Ejercicio guardado.");
  const shared = (
    await admin()
      .from("exercises")
      .select("id,record_type")
      .eq("coach_id", coachId)
      .eq("name", name)
      .single()
  ).data!;
  expect(shared.id).not.toBe(privateId);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const edit = page.getByRole("form", { name: "Editar ejercicio", exact: true });
  await expect(edit.getByRole("combobox", { name: "Tipo de registro", exact: true })).toHaveCount(
    0,
  );
  await expect(edit.getByText("Peso y distancia", { exact: true })).toBeVisible();
  await edit.getByLabel("Nombre", { exact: true }).fill("Compartido ajustado");
  await edit.evaluate((form) => {
    const forged = document.createElement("input");
    forged.type = "hidden";
    forged.name = "recordType";
    forged.value = "duration";
    form.append(forged);
  });
  await edit.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(edit.getByRole("alert")).toBeVisible();
  await expect(edit.getByLabel("Nombre", { exact: true })).toHaveValue("Compartido ajustado");
  await edit.locator('input[name="recordType"]').evaluate((input) => input.remove());
  await edit.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page).toHaveURL(/\/coach\/exercises$/);
  expect(
    (await admin().from("exercises").select("record_type,name").eq("id", shared.id).single()).data,
  ).toEqual({ record_type: "weight_distance", name: "Compartido ajustado" });
  expect(
    (
      await admin()
        .from("exercises")
        .select("record_type,name,personal_owner_id")
        .eq("id", privateId)
        .single()
    ).data,
  ).toEqual({ record_type: "duration", name, personal_owner_id: coachId });
});
