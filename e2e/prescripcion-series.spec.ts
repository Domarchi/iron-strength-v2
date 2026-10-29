import { recoverLegacyWeek } from "./support/recover-legacy-week";
import { test } from "./support/network";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { admin, COACH, resetAll, seedCoach, seedProgram, seedWorkout } from "./support/db";
import { login } from "./support/ui";
import { readStoredTrainingPrescription } from "../src/domain/stored-prescription";
const targets = [
  { repsMin: 6, repsMax: 8, targetWeightKg: 75 },
  { repsMin: 8, repsMax: 10, targetWeightKg: 70 },
  { repsMin: 10, repsMax: 12, targetWeightKg: null },
];
async function fixture(template = false) {
  await resetAll();
  const coach = await seedCoach(),
    program = await seedProgram({ coachId: coach, studentId: coach });
  if (template)
    expect(
      (
        await admin()
          .from("programs")
          .update({ student_id: null, start_date: null, ends_on: null })
          .eq("id", program.programId)
      ).error,
    ).toBeNull();
  const row = (
    await admin()
      .from("session_exercises")
      .select("id")
      .eq("program_session_id", program.sessionId)
      .eq("position", 0)
      .single()
  ).data!;
  return { coach, program, row };
}
test("edita y recupera detalle, exige revisar conversión uniforme y guarda alternativa con su propio detalle", async ({
  page,
}, testInfo) => {
  const { program, row } = await fixture(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, COACH.email, COACH.password);
  await page.goto(`/coach/programs/${program.programId}`);
  await page.getByLabel("Prescripción de Sentadilla", { exact: true }).selectOption("series");
  for (const [i, t] of targets.entries()) {
    await page
      .getByLabel(`Reps mín. de serie ${i + 1} de Sentadilla`, { exact: true })
      .fill(String(t.repsMin));
    await page
      .getByLabel(`Reps máx. de serie ${i + 1} de Sentadilla`, { exact: true })
      .fill(String(t.repsMax));
    await page
      .getByLabel(`Peso (kg) de serie ${i + 1} de Sentadilla`, { exact: true })
      .fill(t.targetWeightKg === null ? "" : String(t.targetWeightKg));
  }
  await page.reload();
  await expect(page.getByLabel("Peso (kg) de serie 2 de Sentadilla", { exact: true })).toHaveValue(
    "70",
  );
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  expect(
    readStoredTrainingPrescription(
      (await admin().from("session_exercises").select("*").eq("id", row.id).single()).data!,
    ).series?.map(({ repsMin, repsMax, targetWeightKg }) => ({ repsMin, repsMax, targetWeightKg })),
  ).toEqual(targets);
  const detailedRow = page.locator('.coach-exercise-row[data-detailed="true"]').first();
  const rowBox = await detailedRow.boundingBox(),
    controlsBox = await detailedRow.locator(".coach-prescription").boundingBox();
  expect(controlsBox!.width).toBeGreaterThan(rowBox!.width * 0.85);
  await page.screenshot({ path: testInfo.outputPath("series-editor-desktop.png"), fullPage: true });
  await page.getByLabel("Prescripción de Sentadilla", { exact: true }).selectOption("uniform");
  const review = page.getByRole("region", {
    name: "Revisar objetivo uniforme de Sentadilla",
    exact: true,
  });
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "Conservar por serie", exact: true }).click();
  await expect(page.getByLabel("Peso (kg) de serie 2 de Sentadilla", { exact: true })).toHaveValue(
    "70",
  );
  await page.getByLabel("Prescripción de Sentadilla", { exact: true }).selectOption("uniform");
  await review.getByRole("button", { name: "Confirmar todas iguales", exact: true }).click();
  await expect(page.getByLabel("Peso (kg) de Sentadilla", { exact: true })).toHaveValue("75");
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  expect(
    readStoredTrainingPrescription(
      (await admin().from("session_exercises").select("*").eq("id", row.id).single()).data!,
    ).series,
  ).toBeNull();
  await page.getByText("Alternativas de Sentadilla (0/3)", { exact: true }).click();
  await page
    .getByRole("button", { name: "Agregar alternativa de Sentadilla", exact: true })
    .click();
  await page
    .getByLabel("Alternativa 1 de Sentadilla", { exact: true })
    .selectOption(program.exercises.get("Press de banca")!);
  await page
    .getByLabel("Prescripción de alternativa 1 de Sentadilla", { exact: true })
    .selectOption("series");
  await page
    .getByLabel("Peso (kg) de serie 1 de alternativa 1 de Sentadilla", { exact: true })
    .fill("25");
  await page
    .getByLabel("Peso (kg) de serie 2 de alternativa 1 de Sentadilla", { exact: true })
    .fill("20");
  await page
    .getByRole("button", { name: "Guardar alternativas de Sentadilla", exact: true })
    .click();
  await expect(page.getByText("Alternativas guardadas.", { exact: true })).toBeVisible();
  expect(
    readStoredTrainingPrescription(
      (
        await admin()
          .from("session_exercise_alternatives")
          .select("*")
          .eq("session_exercise_id", row.id)
          .single()
      ).data!,
    ).series?.map(({ repsMin, repsMax, targetWeightKg }) => ({ repsMin, repsMax, targetWeightKg })),
  ).toEqual([
    { repsMin: 8, repsMax: 12, targetWeightKg: 25 },
    { repsMin: 8, repsMax: 12, targetWeightKg: 20 },
    { repsMin: 8, repsMax: 12, targetWeightKg: null },
  ]);
  await page.getByText("Alternativas de Sentadilla (1/3)", { exact: true }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: testInfo.outputPath("series-editor-mobile.png"), fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    expect(
      (
        await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
      ).violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
  }
});
test("recupera descarga anterior por serie, empieza sin red y sincroniza exactamente una vez", async ({
  page,
  context,
  network,
}) => {
  const { coach, program, row } = await fixture();
  expect(
    (
      await admin()
        .from("session_exercises")
        .update({ superset_id: crypto.randomUUID(), superset_rest_seconds: 120 })
        .eq("program_session_id", program.sessionId)
    ).error,
  ).toBeNull();
  expect(
    (
      await admin()
        .from("session_exercises")
        .update({ reps_min: 6, reps_max: 12, prescription_sets: targets })
        .eq("id", row.id)
    ).error,
  ).toBeNull();
  await seedWorkout({
    studentId: coach,
    exerciseId: program.exercises.get("Sentadilla")!,
    exerciseName: "Sentadilla",
    daysAgo: 1,
  });
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  await page.getByRole("button", { name: "Ver rutina de sesión A", exact: true }).first().click();
  await expect(page.getByText("Serie 2 · 8–10 reps · 70 kg", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar vista previa", exact: true }).click();
  await recoverLegacyWeek(page);
  await page.getByRole("button", { name: "Descargar entrenamientos", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Entrenamientos sin conexión" }).getByRole("status"),
  ).toContainText("Disponible sin conexión");
  await page.close();
  network.offline = true;
  const offline = await context.newPage();
  await offline.goto("/week");
  await offline.getByRole("button", { name: "Iniciar sesión A", exact: true }).click();
  await expect(offline.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toHaveValue("75");
  await expect(offline.getByLabel("Peso de la serie 2 de Sentadilla (kg)")).toHaveValue("70");
  await expect(offline.getByText("Objetivo · 6–8 reps · 75 kg", { exact: true })).toBeVisible();
  await offline
    .getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla", exact: true })
    .click();
  await expect(offline.getByLabel("Repeticiones de la serie 1 de Sentadilla")).toHaveValue("6");
  await offline.reload();
  await expect(offline.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toHaveValue("75");
  await offline.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
  await offline.getByRole("button", { name: "Sí, finalizar", exact: true }).click();
  await expect(offline.getByText("Pendiente de enviar", { exact: true })).toBeVisible();
  network.offline = false;
  await offline.goto("/week");
  await expect(
    offline.getByRole("region", { name: "Sincronización de entrenamientos" }).getByRole("status"),
  ).toContainText("Entrenamiento sincronizado");
  const saved = await admin()
    .from("workouts")
    .select("id,workout_sets(weight_kg,reps)")
    .eq("student_id", coach)
    .eq("program_session_id", program.sessionId);
  expect(saved.error).toBeNull();
  expect(saved.data).toHaveLength(1);
  expect(saved.data![0].workout_sets).toMatchObject([{ weight_kg: 75, reps: 6 }]);
  await offline.reload();
  expect(
    (
      await admin()
        .from("workouts")
        .select("id", { count: "exact" })
        .eq("student_id", coach)
        .eq("program_session_id", program.sessionId)
    ).count,
  ).toBe(1);
});

test("una descarga v1 conserva su objetivo al iniciar; actualizar no reemplaza el borrador y conserva formatos futuros", async ({
  page,
}) => {
  const { program, row } = await fixture();
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  const download = page.getByRole("region", { name: "Entrenamientos sin conexión", exact: true });
  await recoverLegacyWeek(page);
  await download.getByRole("button", { name: "Descargar entrenamientos", exact: true }).click();
  await expect(download.getByRole("status")).toContainText("Disponible sin conexión");
  const mutateStoredVersion = async (version: number) =>
    page.evaluate(
      (version) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("iron-strength-offline", 1);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result,
              tx = db.transaction("weeks", "readwrite"),
              store = tx.objectStore("weeks"),
              read = store.getAll();
            read.onsuccess = () => {
              for (const pack of read.result) store.put({ ...pack, version });
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onabort = () => reject(tx.error);
          };
        }),
      version,
    );
  await mutateStoredVersion(1);
  await page.goto("/offline");
  await page.getByRole("button", { name: "Iniciar sesión A", exact: true }).click();
  await expect(page.getByLabel("Repeticiones de la serie 1 de Sentadilla")).toHaveAttribute(
    "placeholder",
    "8",
  );
  expect(
    (
      await admin()
        .from("session_exercises")
        .update({ reps_min: 6, reps_max: 12, prescription_sets: targets })
        .eq("id", row.id)
    ).error,
  ).toBeNull();
  await page.goto("/week");
  await download
    .getByRole("button", { name: "Actualizar entrenamientos descargados", exact: true })
    .click();
  await expect(download.getByRole("status")).toContainText("Disponible sin conexión");
  await page
    .getByRole("region", { name: "Próxima sesión", exact: true })
    .getByRole("button", { name: "Retomar", exact: true })
    .click();
  await expect(page.getByLabel("Repeticiones de la serie 1 de Sentadilla")).toHaveAttribute(
    "placeholder",
    "8",
  );
  await expect(page.getByText("Objetivo · 6–8 reps · 75 kg", { exact: true })).toHaveCount(0);
  await page.goto("/week");
  await mutateStoredVersion(99);
  await page.reload();
  await expect(download.getByRole("alert")).toContainText("Conservamos una copia anterior");
  const button = download.getByRole("button", {
    name: "Actualizar entrenamientos descargados",
    exact: true,
  });
  await button.click();
  await expect(button).toBeEnabled();
  await expect(download.getByRole("status")).toContainText("Disponible sin conexión");
  await expect(download.getByRole("alert")).toContainText("Conservamos una copia anterior");
  const versions = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const req = indexedDB.open("iron-strength-offline");
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction("weeks", "readonly"),
            get = tx.objectStore("weeks").getAll();
          get.onsuccess = () => resolve(get.result.map((p) => p.version));
          tx.oncomplete = () => db.close();
        };
      }),
  );
  expect(versions).toEqual([99]);
});
