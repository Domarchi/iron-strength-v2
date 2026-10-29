import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupPersonalTraining } from "./support/personal-training-fixture";
import { libraryExercises } from "./support/library-fixture";
import { recordingFixture } from "../../src/test/fixtures/workout-recording";
import { recordingPayloadSchema } from "../../src/lib/mobile/recording-contracts";
import { downloadId } from "../../src/test/fixtures/week-download";
import { editablePersonalItems } from "../../src/domain/personal-routines";
import { enterWeekUser } from "./support/week-fixture";
import type { PersonalRoutine } from "../../src/lib/mobile/personal-contracts";
const key = `is:native-library:v1:${downloadId(1)}`;
function source() {
  const doc = recordingPayloadSchema.parse(recordingFixture("personal"));
  if (doc.source !== "personal" || doc.workout.origin.kind !== "personal") throw Error("fixture");
  doc.workout.startedAt = "2026-10-23T12:00:00Z";
  doc.workout.finishedAt = "2026-10-23T12:30:00Z";
  doc.structure.exercises.forEach((e, i) => {
    e.exerciseId = libraryExercises[i].id;
  });
  doc.workout.sets = [{ ...doc.workout.sets[0], exerciseId: libraryExercises[0].id }];
  const base: PersonalRoutine = {
    id: doc.workout.origin.routineId,
    name: "Base actual",
    revision: 4,
    folderId: null,
    position: 0,
    createdAt: "2026-10-23T10:00:00Z",
    updatedAt: "2026-10-23T11:00:00Z",
    items: doc.structure.exercises.map((e, i) => ({
      ...libraryExercises[i],
      ...e.prescribed,
      id: e.id,
      exerciseId: e.exerciseId,
      position: i,
      note: "Nota actual",
      restSeconds: e.restSeconds,
      supersetId: e.supersetId,
      supersetRestSeconds: e.supersetRestSeconds,
      targetWeightKg: 50,
    })),
  };
  return { doc, base };
}
async function setup(page: Page, draft = false) {
  const { doc, base } = source();
  if (draft)
    await page.addInitScript(
      ({ key, userId, base }) => {
        localStorage.setItem(
          key,
          JSON.stringify({ version: 1, userId, pending: null, drafts: [base] }),
        );
      },
      {
        key,
        userId: downloadId(1),
        base: {
          id: base.id,
          name: "Edición pendiente",
          baseRevision: 2,
          folderId: null,
          changed: true,
          items: editablePersonalItems(base),
        },
      },
    );
  const f = await setupPersonalTraining(page);
  f.state.value.routines = [base];
  f.control.records.set(doc.id, doc.workout);
  f.control.recordings.set(doc.id, doc);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page
    .getByRole("button", { name: "Ver entrenamiento del 23/10 · Superior", exact: true })
    .click();
  await expect(page.getByText("Sesión registrada", { exact: true })).toBeVisible();
  return { ...f, doc, base };
}
for (const theme of ["light", "dark"] as const) {
  test(`guardar rutina ${theme}: revisión sin escritura, copia completa independiente y confirmación`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.addInitScript(
      (theme) =>
        localStorage.setItem(
          "is:native-appearance:v1",
          JSON.stringify({ version: 1, preference: theme }),
        ),
      theme,
    );
    const { state, control, doc, base } = await setup(page);
    const original = structuredClone(base);
    await page.getByRole("button", { name: "Guardar como rutina", exact: true }).click();
    await expect(page.getByText("Nueva rutina · 2 ejercicios", { exact: true })).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
    expect(state.calls).toHaveLength(0);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`save-routine-${theme}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Continuar al editor", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }),
    ).toHaveValue("Superior");
    const local = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).drafts[0], key);
    expect(local.id).not.toBe(base.id);
    expect(local.items).toHaveLength(2);
    expect(local.items[0].id).not.toBe(doc.structure.exercises[0].id);
    expect(local.items[0].supersetId).not.toBe(doc.structure.exercises[0].supersetId);
    await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Ver rutina Superior", exact: true }),
    ).toBeVisible();
    expect(state.value.routines).toHaveLength(2);
    expect(state.value.routines.find((r) => r.id === base.id)).toEqual(original);
    const copy = state.value.routines.find((r) => r.id !== base.id)!;
    expect(copy.items[1].targetWeightKg).toBe(30);
    expect(copy.items[0].supersetId).toBe(copy.items[1].supersetId);
    expect(control.recordings.get(doc.id)).toEqual(doc);
    expect(control.recordingCalls).toHaveLength(0);
  });
}
test("actualizar compara revisiones y mantiene carpeta/nombre con revisión explícita", async ({
  page,
}) => {
  const { state, base, doc, control } = await setup(page);
  await page.getByRole("button", { name: "Actualizar mi rutina", exact: true }).click();
  await expect(
    page.getByText("La base cambió desde este entrenamiento. Revisa lo que vas a reemplazar.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Base actual · Base actual", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Revisar actualización en el editor", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Nombre de la rutina", exact: true })).toHaveValue(
    base.name,
  );
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ver rutina Base actual", exact: true }),
  ).toBeVisible();
  expect(state.value.routines).toHaveLength(1);
  expect(state.calls[0]).toMatchObject({
    operation: "routine_save",
    targetId: base.id,
    expectedRevision: 4,
  });
  expect(state.value.routines[0]).toMatchObject({
    id: base.id,
    name: base.name,
    folderId: base.folderId,
    revision: 5,
  });
  expect(state.value.routines[0].items[0].targetWeightKg).toBe(30);
  expect(control.recordings.get(doc.id)).toEqual(doc);
});
test("base eliminada permite copia y un cambio después de revisar exige actualizar la vista previa", async ({
  page,
}) => {
  const { state } = await setup(page);
  state.value.routines = [];
  await page.getByRole("button", { name: "Actualizar mi rutina", exact: true }).click();
  await expect(
    page.getByText("La base ya no está disponible. Puedes guardar una rutina independiente.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar al editor", exact: true }).click();
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ver rutina Superior", exact: true }),
  ).toBeVisible();
  expect(state.calls[0].operation).toBe("routine_create");
});
test("un cambio mientras se revisa no crea borrador ni reemplaza la base", async ({ page }) => {
  const { state } = await setup(page);
  await page.getByRole("button", { name: "Actualizar mi rutina", exact: true }).click();
  await expect(
    page.getByText("Propuesta de reemplazo · 2 ejercicios", { exact: true }),
  ).toBeVisible();
  state.value.routines[0].revision++;
  await page
    .getByRole("button", { name: "Revisar actualización en el editor", exact: true })
    .click();
  await expect(
    page.getByText(
      "El resultado, catálogo o base cambió. Actualiza la vista previa antes de continuar.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  expect(state.calls).toHaveLength(0);
});
test("el borrador anterior se conserva y puede abrirse sin sustituir su contenido", async ({
  page,
}) => {
  const { state } = await setup(page, true);
  await page.getByRole("button", { name: "Actualizar mi rutina", exact: true }).click();
  await expect(
    page.getByText("Esta base ya tiene un borrador con cambios. Se conserva tu edición.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abrir borrador", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Nombre de la rutina", exact: true })).toHaveValue(
    "Edición pendiente",
  );
  expect(state.calls).toHaveLength(0);
});
test("respuesta perdida al guardar la copia conserva un intento estable y se confirma al recargar", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.getByRole("button", { name: "Guardar como rutina", exact: true }).click();
  await page.getByRole("button", { name: "Continuar al editor", exact: true }).click();
  state.loseResponse = true;
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByText("No pudimos confirmar el guardado.", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Mis rutinas", exact: true }).click();
  await page.getByRole("button", { name: "Reintentar guardado de rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ver rutina Superior", exact: true }),
  ).toBeVisible();
  expect(state.value.routines).toHaveLength(2);
  expect(state.calls[1]).toEqual(state.calls[0]);
});
test("un conflicto posterior conserva los objetivos y permite guardar una copia", async ({
  page,
}) => {
  const { state, base } = await setup(page);
  await page.getByRole("button", { name: "Actualizar mi rutina", exact: true }).click();
  await page
    .getByRole("button", { name: "Revisar actualización en el editor", exact: true })
    .click();
  state.conflict = true;
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByText("La rutina cambió en otra ventana.", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(state.value.routines[0]).toEqual(base);
  await page.getByRole("button", { name: "Crear copia del borrador", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Nombre de la rutina", exact: true })).toHaveValue(
    "Base actual (copia)",
  );
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ver rutina Base actual (copia)", exact: true }),
  ).toBeVisible();
  expect(state.value.routines).toHaveLength(2);
  expect(state.value.routines.find((r) => r.id === base.id)).toEqual(base);
});

test("cuota conserva una propuesta completa y permite abrir/proteger el mismo borrador", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.getByRole("button", { name: "Guardar como rutina", exact: true }).click();
  await expect(page.getByText("Nueva rutina · 2 ejercicios", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("is:native-library:") && !localStorage.getItem("allow-library-write"))
        throw Error("quota");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Continuar al editor", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abrir borrador", exact: true })).toBeVisible();
  expect(state.calls).toHaveLength(0);
  await page.getByRole("button", { name: "Abrir borrador", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Nombre de la rutina", exact: true })).toHaveValue(
    "Superior",
  );
  await page.evaluate(() => localStorage.setItem("allow-library-write", "1"));
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(
    page.getByText("Guardado en este dispositivo", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const doc = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
  expect(doc.drafts).toHaveLength(1);
  expect(doc.drafts[0].items).toHaveLength(2);
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ver rutina Superior", exact: true }),
  ).toBeVisible();
  expect(state.value.routines).toHaveLength(2);
  expect(state.calls[0].targetId).toBe(doc.drafts[0].id);
});

test("salir mientras se comprueba la revisión no prepara un borrador tardío", async ({ page }) => {
  const { state } = await setup(page);
  await page.getByRole("button", { name: "Guardar como rutina", exact: true }).click();
  await expect(page.getByText("Nueva rutina · 2 ejercicios", { exact: true })).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const requested = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route("**/api/mobile/v1/exercises", async (route) => {
    entered();
    await gate;
    await route.fallback();
  });
  await page.getByRole("button", { name: "Continuar al editor", exact: true }).click();
  await requested;
  await page.goBack();
  await expect(
    page.getByText("Sesión registrada", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const completed = page.waitForResponse((r) => r.url().endsWith("/api/mobile/v1/exercises"));
  release();
  await completed;
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  expect(state.calls).toHaveLength(0);
});
