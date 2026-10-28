import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { setupOwnExercises } from "./support/personal-exercise-fixture";
import { enterWeekUser } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
for (const theme of ["light", "dark"] as const) {
  test(`ejercicios propios ${theme}: crear, editar, archivar/restaurar y catálogo a360px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.addInitScript(
      (t) =>
        localStorage.setItem(
          "is:native-appearance:v1",
          JSON.stringify({ version: 1, preference: t }),
        ),
      theme,
    );
    const { state } = await setupOwnExercises(page);
    await page.getByRole("button", { name: "Nuevo ejercicio", exact: true }).click();
    await page.getByLabel("Nombre del ejercicio", { exact: true }).fill("Plancha propia");
    await page.getByRole("button", { name: "Tipo de registro", exact: true }).click();
    await page.getByRole("button", { name: "Tipo Tiempo", exact: true }).click();
    await page.getByRole("button", { name: "Guardar ejercicio", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Opciones de Plancha propia", exact: true }),
    ).toBeVisible();
    expect(state.value.exercises[0].recordType).toBe("duration");
    await page.getByRole("button", { name: "Opciones de Plancha propia", exact: true }).click();
    await page.getByRole("button", { name: "Editar Plancha propia", exact: true }).click();
    await page.getByLabel("Nombre del ejercicio", { exact: true }).fill("Plancha lateral propia");
    await expect(page.getByRole("button", { name: "Tipo de registro", exact: true })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Ajustes del ejercicio", exact: true }).click();
    await expect(page.getByLabel("Incremento de carga (kg)", { exact: true })).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Ejercicio con peso corporal", exact: true }).check();
    await expect(
      page.getByText("Guardado en este dispositivo", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`own-exercise-${theme}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Guardar ejercicio", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Opciones de Plancha lateral propia", exact: true }),
    ).toBeVisible();
    expect(state.value.exercises[0].isBodyweight).toBe(true);
    expect(state.value.exercises[0].progressionIncrementKg).toBe(2.5);
    await page
      .getByRole("button", { name: "Opciones de Plancha lateral propia", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Archivar Plancha lateral propia", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirmar archivo", exact: true }).click();
    await expect(page.getByText("Sin ejercicios propios activos", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Archivados", exact: true }).click();
    await page
      .getByRole("button", { name: "Opciones de Plancha lateral propia", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Restaurar Plancha lateral propia", exact: true })
      .click();
    await expect(page.getByText("Sin ejercicios archivados", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Volver a Biblioteca", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Buscar ejercicios", exact: true })
      .fill("Plancha lateral propia");
    await expect(
      page.getByRole("button", { name: "Ver ejercicio Plancha lateral propia", exact: true }),
    ).toBeVisible();
  });
}
test("recarga y respuesta perdida conservan intento; Cuenta bloquea salir hasta confirmarlo", async ({
  page,
}) => {
  const { state } = await setupOwnExercises(page);
  await page.getByRole("button", { name: "Nuevo ejercicio", exact: true }).click();
  await page.getByLabel("Nombre del ejercicio", { exact: true }).fill("Pendiente propio");
  state.lose = true;
  await page.getByRole("button", { name: "Guardar ejercicio", exact: true }).click();
  await expect(
    page.getByText("No pudimos confirmar el guardado.", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const frozen = state.calls[0];
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Revisar ejercicios pendientes", exact: true }).click();
  await page.getByRole("button", { name: "Reintentar guardado de ejercicio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Opciones de Pendiente propio", exact: true }),
  ).toBeVisible();
  expect(state.calls.at(-1)).toEqual(frozen);
  expect(state.value.exercises).toHaveLength(1);
});
test("revisión explícita conserva texto local y nueva revisión, exportación contiene solo metadatos propios", async ({
  page,
}) => {
  const { state } = await setupOwnExercises(page);
  state.value.exercises.push({
    id: downloadId(970),
    revision: 1,
    archivedAt: null,
    name: "Original",
    muscleGroup: "Core",
    equipment: null,
    isBodyweight: true,
    progressionIncrementKg: 2.5,
    recordType: "duration",
  });
  await page.getByRole("button", { name: "Actualizar ejercicios", exact: true }).click();
  await page.getByRole("button", { name: "Opciones de Original", exact: true }).click();
  await page.getByRole("button", { name: "Editar Original", exact: true }).click();
  await page.getByLabel("Nombre del ejercicio", { exact: true }).fill("Mi cambio");
  state.value.exercises[0].revision = 2;
  state.value.exercises[0].name = "Cambio remoto";
  await page.getByRole("button", { name: "Guardar ejercicio", exact: true }).click();
  await page
    .getByRole("button", { name: "Revisar versión actual del ejercicio", exact: true })
    .click();
  await expect(
    page.getByText("Cambio remoto", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Conservar mi edición", exact: true }).click();
  await expect(page.getByLabel("Nombre del ejercicio", { exact: true })).toHaveValue("Mi cambio");
  await page.getByRole("button", { name: "Guardar ejercicio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Opciones de Mi cambio", exact: true }),
  ).toBeVisible();
  expect(state.calls.at(-1)?.expectedRevision).toBe(2);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar mis ejercicios", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("iron-strength-ejercicios.json");
  const stream = await file.createReadStream();
  let body = "";
  if (!stream) throw Error("Sin archivo");
  for await (const chunk of stream) body += chunk.toString();
  expect(JSON.parse(body)).toEqual(state.value);
  expect(body).not.toContain("synthetic-access");
});
test("borrador incompleto persiste y descarte explícito permite salir sin borrar otras cuentas", async ({
  page,
}) => {
  await setupOwnExercises(page);
  await page.getByRole("button", { name: "Nuevo ejercicio", exact: true }).click();
  await page.getByLabel("Nombre del ejercicio", { exact: true }).fill("Local");
  await page.getByRole("button", { name: "Ajustes del ejercicio", exact: true }).click();
  await page.getByLabel("Incremento de carga (kg)", { exact: true }).fill("2,");
  await page.getByRole("button", { name: "Volver a mis ejercicios", exact: true }).click();
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await page.getByRole("button", { name: "Revisar ejercicios pendientes", exact: true }).click();
  await page.getByRole("button", { name: "Retomar ejercicio Local", exact: true }).click();
  await page.getByRole("button", { name: "Ajustes del ejercicio", exact: true }).click();
  await expect(page.getByLabel("Incremento de carga (kg)", { exact: true })).toHaveValue("2,");
  await page.getByRole("button", { name: "Descartar cambios del ejercicio", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar descarte del ejercicio", exact: true }).click();
  await page.getByRole("button", { name: "Volver a Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Volver a Entrenar", exact: true }).click();
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeEnabled();
});
test("cuota conserva texto y foco; reintentar protege el mismo ejercicio antes de enviarlo", async ({
  page,
}) => {
  const { state } = await setupOwnExercises(page);
  await page.getByRole("button", { name: "Nuevo ejercicio", exact: true }).click();
  await page.getByLabel("Nombre del ejercicio", { exact: true }).fill("Cuota");
  await expect(
    page.getByText("Guardado en este dispositivo", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const key = `is:native-personal-exercises:v1:${downloadId(1)}`;
  const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).draft.id, key);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (
        key.startsWith("is:native-personal-exercises:") &&
        !localStorage.getItem("allow-personal-exercise-write")
      )
        throw Error("quota");
      return original.call(this, key, value);
    };
  });
  const field = page.getByLabel("Nombre del ejercicio", { exact: true });
  await field.focus();
  await field.pressSequentially(" conservada");
  await expect(field).toHaveValue("Cuota conservada");
  await expect(field).toBeFocused();
  await expect(page.getByRole("button", { name: "Guardar ejercicio", exact: true })).toBeDisabled();
  expect(state.calls).toHaveLength(0);
  await page.evaluate(() => localStorage.setItem("allow-personal-exercise-write", "1"));
  await page
    .getByRole("button", { name: "Reintentar guardado local de ejercicio", exact: true })
    .click();
  await page.getByRole("button", { name: "Guardar ejercicio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Opciones de Cuota conservada", exact: true }),
  ).toBeVisible();
  expect(state.calls).toHaveLength(1);
  expect(state.calls[0].targetId).toBe(before);
});
test("dos ventanas conservan la edición en memoria y el documento vigente sin sobrescribir", async ({
  page,
}) => {
  const { state } = await setupOwnExercises(page);
  await page.getByRole("button", { name: "Nuevo ejercicio", exact: true }).click();
  await page.getByLabel("Nombre del ejercicio", { exact: true }).fill("Ventana uno");
  await expect(
    page.getByText("Guardado en este dispositivo", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const second = await page.context().newPage();
  try {
    await setupOwnExercises(second);
    await second
      .getByRole("button", { name: "Retomar ejercicio Ventana uno", exact: true })
      .click();
    await second.getByLabel("Nombre del ejercicio", { exact: true }).fill("Ventana dos");
    await expect(
      second.getByText("Guardado en este dispositivo", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await page.getByLabel("Nombre del ejercicio", { exact: true }).fill("Mi propuesta en memoria");
    await expect(
      page
        .getByText(/Los cambios locales se modificaron en otra ventana/)
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Nombre del ejercicio", { exact: true })).toHaveValue(
      "Mi propuesta en memoria",
    );
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).draft.values.name,
        `is:native-personal-exercises:v1:${downloadId(1)}`,
      ),
    ).toBe("Ventana dos");
    expect(state.calls).toHaveLength(0);
  } finally {
    await second.close();
  }
});
test("conflicto al archivar exige revisar y volver a confirmar con la revisión actual", async ({
  page,
}) => {
  const { state } = await setupOwnExercises(page);
  state.value.exercises.push({
    id: downloadId(971),
    revision: 1,
    archivedAt: null,
    name: "Archivo original",
    muscleGroup: "Core",
    equipment: null,
    isBodyweight: false,
    progressionIncrementKg: 2.5,
    recordType: "weight_reps",
  });
  await page.getByRole("button", { name: "Actualizar ejercicios", exact: true }).click();
  await page.getByRole("button", { name: "Opciones de Archivo original", exact: true }).click();
  await page.getByRole("button", { name: "Archivar Archivo original", exact: true }).click();
  state.value.exercises[0].revision = 2;
  state.value.exercises[0].name = "Archivo actualizado";
  await page.getByRole("button", { name: "Confirmar archivo", exact: true }).click();
  await page
    .getByRole("button", { name: "Revisar versión actual del ejercicio", exact: true })
    .click();
  await page.getByRole("button", { name: "Volver a revisar la acción", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirmar archivo", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Opciones de Archivo actualizado", exact: true }).click();
  await page.getByRole("button", { name: "Archivar Archivo actualizado", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar archivo", exact: true }).click();
  await expect(page.getByText("Sin ejercicios propios activos", { exact: true })).toBeVisible();
  expect(state.calls.at(-1)?.expectedRevision).toBe(2);
  expect(state.calls.at(-1)?.requestId).not.toBe(state.calls[0].requestId);
});
