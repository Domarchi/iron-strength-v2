import { expect, test, type Route } from "@playwright/test";
import { admin, resetAll, seedCoach, COACH } from "./support/db";
import { login } from "./support/ui";

test.afterAll(async () => {
  await resetAll();
});
test("el formulario espera a estar listo y conserva nombre/tipo tras rechazar antes de confirmar", async ({
  page,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const privateId = crypto.randomUUID();
  const name = "Control hidratación";
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
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = 0;
  const scripts = async (route: Route) => {
    if (new URL(route.request().url()).pathname.endsWith(".js")) {
      held++;
      await gate;
    }
    await route.continue();
  };
  await page.route("**/_next/static/**", scripts);
  const form = page.getByRole("form", { name: "Crear ejercicio", exact: true });
  try {
    await page.goto("/coach/exercises", { waitUntil: "commit" });
    await expect(form).toBeVisible();
    await expect.poll(() => held).toBeGreaterThan(0);
    await expect(form.getByLabel("Nombre", { exact: true })).toBeDisabled();
    await expect(form.getByLabel("Tipo de registro", { exact: true })).toBeDisabled();
    await expect(form.getByRole("button", { name: "Crear ejercicio", exact: true })).toBeDisabled();
  } finally {
    release();
  }
  await expect(form.getByLabel("Nombre", { exact: true })).toBeEnabled();
  await page.unroute("**/_next/static/**", scripts);
  await form.getByLabel("Nombre", { exact: true }).fill(name);
  await form.getByLabel("Tipo de registro", { exact: true }).selectOption("weight_distance");
  await form.getByLabel("Incremento de carga (kg)", { exact: true }).fill("0");
  await form.getByRole("button", { name: "Crear ejercicio", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("Revisa los datos");
  await expect(form.getByLabel("Nombre", { exact: true })).toHaveValue(name);
  await expect(form.getByLabel("Tipo de registro", { exact: true })).toHaveValue("weight_distance");
  await expect(form.getByLabel("Incremento de carga (kg)", { exact: true })).toHaveValue("0");
  await form.getByLabel("Incremento de carga (kg)", { exact: true }).fill("2,5");
  await form.getByRole("button", { name: "Crear ejercicio", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Ejercicio guardado.");
  await expect(form.getByLabel("Nombre", { exact: true })).toHaveValue("");
  await expect(form.getByLabel("Tipo de registro", { exact: true })).toHaveValue("weight_reps");
  const shared = await admin()
    .from("exercises")
    .select("id,record_type,personal_owner_id")
    .eq("coach_id", coachId)
    .eq("name", name)
    .single();
  expect(shared.error).toBeNull();
  expect(shared.data).toMatchObject({ record_type: "weight_distance", personal_owner_id: null });
  expect(shared.data!.id).not.toBe(privateId);
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
