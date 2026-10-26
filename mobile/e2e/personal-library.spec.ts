import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { setupPersonalLibrary } from "./support/library-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
import { enterWeekUser } from "./support/week-fixture";
for (const theme of ["light", "dark"] as const) {
  test(`crear rutina ${theme} sin programa con selección múltiple, grupo y detalle por serie`, async ({
    page,
  }) => {
    await page.addInitScript(
      (theme) =>
        localStorage.setItem(
          "is:native-appearance:v1",
          JSON.stringify({ version: 1, preference: theme }),
        ),
      theme,
    );
    await page.setViewportSize({ width: 360, height: 800 });
    const { state } = await setupPersonalLibrary(page);
    await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
    await page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }).fill("Superior");
    await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
    await page.getByRole("checkbox", { name: "Seleccionar Press de banca", exact: true }).check();
    await page
      .getByRole("checkbox", { name: "Seleccionar Remo con mancuerna", exact: true })
      .check();
    await page.getByRole("button", { name: "Agregar 2 ejercicios", exact: true }).click();
    await page.getByLabel("Peso de Press de banca", { exact: true }).fill("30");
    await page.getByRole("checkbox", { name: "Seleccionar Press de banca", exact: true }).check();
    await page
      .getByRole("checkbox", { name: "Seleccionar Remo con mancuerna", exact: true })
      .check();
    await page.getByRole("button", { name: "Agrupar ejercicios", exact: true }).click();
    await expect(
      page.getByText("Superserie 1", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Acciones de Press de banca", exact: true }).click();
    await page
      .getByRole("button", { name: "Editar detalles de Press de banca", exact: true })
      .click();
    await page.getByLabel("Nota de Press de banca", { exact: true }).fill("Bajada controlada");
    await page
      .getByRole("button", { name: "Prescribir por serie en Press de banca", exact: true })
      .click();
    await page
      .getByLabel("Peso objetivo de la serie 2 de Press de banca", { exact: true })
      .fill("25");
    await expect(
      page.getByText("Guardado en este dispositivo", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("personal-editor.png"), fullPage: true });
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Editar rutina Superior", exact: true }),
    ).toBeVisible();
    const saved = state.value.routines[0];
    expect(saved.items).toHaveLength(2);
    expect(saved.items[0].supersetId).toBe(saved.items[1].supersetId);
    expect(saved.items[0].series?.[1].targetWeightKg).toBe(25);
    expect(saved.items[0].note).toBe("Bajada controlada");
  });
}
test("respuesta perdida, recarga y reintento usan un único intento; no duplica", async ({
  page,
}) => {
  const { state } = await setupPersonalLibrary(page);
  await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
  await page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }).fill("Pendiente");
  state.loseResponse = true;
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByText("No pudimos confirmar el guardado.", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(state.value.routines).toHaveLength(1);
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Mis rutinas", exact: true }).click();
  await page.getByRole("button", { name: "Reintentar guardado de rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Editar rutina Pendiente", exact: true }),
  ).toBeVisible();
  expect(state.value.routines).toHaveLength(1);
  expect(state.calls[1]).toEqual(state.calls[0]);
});
test("recupera edición al recargar y protege el conflicto con el servidor", async ({ page }) => {
  const { state } = await setupPersonalLibrary(page);
  await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
  await page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }).fill("Mi base");
  await page.getByRole("button", { name: "Volver a mis rutinas", exact: true }).click();
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Mis rutinas", exact: true }).click();
  await page.getByRole("button", { name: "Retomar borrador Mi base", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Nombre de la rutina", exact: true })).toHaveValue(
    "Mi base",
  );
  state.conflict = true;
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByText("La rutina cambió en otra ventana.", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }),
  ).not.toBeEditable();
  await page.getByRole("button", { name: "Crear copia del borrador", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Nombre de la rutina", exact: true })).toHaveValue(
    "Mi base (copia)",
  );
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Editar rutina Mi base (copia)", exact: true }),
  ).toBeVisible();
  expect(state.calls[1].requestId).not.toBe(state.calls[0].requestId);
  expect(state.calls[1].targetId).not.toBe(state.calls[0].targetId);
});

test("carpetas, copia independiente, orden y borrado confirmado", async ({ page }) => {
  const { state } = await setupPersonalLibrary(page);
  await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
  await page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }).fill("Base");
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await page.getByRole("button", { name: "Opciones de biblioteca", exact: true }).click();
  await page.getByLabel("Nombre de la carpeta", { exact: true }).fill("Fuerza");
  await page.getByRole("button", { name: "Crear carpeta", exact: true }).click();
  await expect(page.getByText("Fuerza", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "Acciones de rutina Base", exact: true }).click();
  await expect(page.getByRole("button", { name: "Subir", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Bajar", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Duplicar rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Editar rutina Base (copia)", exact: true }),
  ).toBeVisible();
  expect(state.value.routines).toHaveLength(2);
  expect(state.value.routines[0].id).not.toBe(state.value.routines[1].id);
  await page.getByRole("button", { name: "Acciones de rutina Base (copia)", exact: true }).click();
  await page.getByRole("button", { name: "Subir", exact: true }).click();
  expect(state.value.routines.find((r) => r.name === "Base (copia)")!.position).toBe(0);
  await page.getByRole("button", { name: "Acciones de rutina Base (copia)", exact: true }).click();
  await page.getByRole("button", { name: "Mover a carpeta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sin carpeta", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Mover a Fuerza", exact: true }).click();
  expect(state.value.routines.find((r) => r.name === "Base (copia)")!.folderId).toBe(
    state.value.folders[0].id,
  );
  await page.getByRole("button", { name: "Acciones de carpeta Fuerza", exact: true }).click();
  await page.getByRole("button", { name: "Renombrar carpeta", exact: true }).click();
  await page.getByLabel("Nuevo nombre de carpeta", { exact: true }).fill("Mi fuerza");
  await page.getByRole("button", { name: "Guardar nombre de carpeta", exact: true }).click();
  await page.getByRole("button", { name: "Acciones de carpeta Mi fuerza", exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Eliminar carpeta", exact: true }).click();
  expect(state.value.folders).toHaveLength(1);
  await page.getByRole("button", { name: "Confirmar eliminación de carpeta", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Acciones de carpeta Mi fuerza", exact: true }),
  ).toHaveCount(0);
  expect(state.value.routines).toHaveLength(2);
  expect(state.value.routines.every((r) => r.folderId === null)).toBe(true);
  await page.getByRole("button", { name: "Acciones de rutina Base (copia)", exact: true }).click();
  await page.getByRole("button", { name: "Eliminar rutina", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar eliminación de rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Editar rutina Base (copia)", exact: true }),
  ).toHaveCount(0);
  expect(state.value.routines.map((r) => r.name)).toEqual(["Base"]);
});

test("cuota conserva la selección agregada y reintenta sin duplicar filas", async ({ page }) => {
  const { state } = await setupPersonalLibrary(page);
  await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
  await page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }).fill("Conservar");
  await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  await page.getByRole("checkbox", { name: "Seleccionar Press de banca", exact: true }).check();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("is:native-library:") && !localStorage.getItem("allow-library-write"))
        throw Error("quota");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Agregar 1 ejercicio", exact: true }).click();
  await expect(
    page
      .getByText(
        "No pudimos guardar los cambios en este dispositivo. Revisa el espacio disponible y reintenta.",
        { exact: true },
      )
      .filter({ visible: true }),
  ).toBeVisible();
  expect(state.calls).toHaveLength(0);
  await page.evaluate(() => localStorage.setItem("allow-library-write", "1"));
  await page.getByRole("button", { name: "Reintentar guardado local", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Nombre de la rutina", exact: true })).toHaveValue(
    "Conservar",
  );
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Editar rutina Conservar", exact: true }),
  ).toBeVisible();
  expect(state.value.routines[0].items).toHaveLength(1);
});

test("salida protegida y formato desconocido conservado", async ({ page }) => {
  await setupPersonalLibrary(page);
  await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
  await page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }).fill("Sin perder");
  await page.getByRole("button", { name: "Volver a mis rutinas", exact: true }).click();
  await page.getByRole("button", { name: "Volver a Entrenar", exact: true }).click();
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Revisar cambios de rutinas", exact: true }).click();
  await page.getByRole("button", { name: "Retomar borrador Sin perder", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Nombre de la rutina", exact: true })).toHaveValue(
    "Sin perder",
  );
  const key = `is:native-library:v1:${downloadId(1)}`;
  await page.evaluate((key) => localStorage.setItem(key, '{"version":99,"keep":"future"}'), key);
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
  await expect(
    page
      .getByText(
        "No pudimos recuperar tus rutinas locales. Se conservan; reintenta con una versión compatible.",
        { exact: true },
      )
      .filter({ visible: true }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    '{"version":99,"keep":"future"}',
  );
});

test("mover superserie conserva bloque; edición colectiva conserva notas", async ({ page }) => {
  const { state } = await setupPersonalLibrary(page);
  await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
  await page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }).fill("Bloques");
  await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  for (const name of ["Press de banca", "Remo con mancuerna", "Sentadilla"])
    await page.getByRole("checkbox", { name: `Seleccionar ${name}`, exact: true }).check();
  await page.getByRole("button", { name: "Agregar 3 ejercicios", exact: true }).click();
  await page.getByRole("checkbox", { name: "Seleccionar Press de banca", exact: true }).check();
  await page.getByRole("checkbox", { name: "Seleccionar Remo con mancuerna", exact: true }).check();
  await page.getByRole("button", { name: "Agrupar ejercicios", exact: true }).click();
  await page.getByRole("button", { name: "Acciones de Press de banca", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Subir Press de banca", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Bajar Press de banca", exact: true }).click();
  await page.getByRole("button", { name: "Acciones de Press de banca", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Bajar Press de banca", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Editar detalles de Press de banca", exact: true })
    .click();
  await page.getByLabel("Nota de Press de banca", { exact: true }).fill("Mi nota");
  await page.getByRole("checkbox", { name: "Seleccionar Press de banca", exact: true }).check();
  await page.getByRole("checkbox", { name: "Seleccionar Remo con mancuerna", exact: true }).check();
  await page.getByRole("button", { name: "Editar selección", exact: true }).click();
  await page.getByRole("checkbox", { name: "Cambiar series", exact: true }).check();
  await page.getByLabel("Series de la selección", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Revisar cambios de selección", exact: true }).click();
  await expect(page.getByLabel("Series de Press de banca", { exact: true })).toHaveValue("3");
  await page.getByRole("button", { name: "Aplicar a la selección", exact: true }).click();
  await expect(page.getByLabel("Series de Press de banca", { exact: true })).toHaveValue("4");
  await expect(page.getByLabel("Nota de Press de banca", { exact: true })).toHaveValue("Mi nota");
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Editar rutina Bloques", exact: true }),
  ).toBeVisible();
  const items = state.value.routines[0].items;
  expect(items.map((r) => r.name)).toEqual(["Sentadilla", "Press de banca", "Remo con mancuerna"]);
  expect(items.map((r) => r.sets)).toEqual([3, 4, 4]);
  expect(items[1].supersetId).toBe(items[2].supersetId);
  expect(items[1].note).toBe("Mi nota");
});
