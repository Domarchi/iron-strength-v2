import { openResultOptions } from "./support/result-options";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupRemoval } from "./support/removal-fixture";
import { enterWeekUser } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
const key = `is:workout-removal:v1:${downloadId(1)}`;
for (const theme of ["light", "dark"] as const) {
  test(`eliminación explícita con respuesta perdida y recuperación · ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const c = await setupRemoval(page);
    await page.getByRole("tab", { name: "Historial", exact: true }).click();
    await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
    await openResultOptions(page);
    await page.getByRole("button", { name: "Eliminar entrenamiento", exact: true }).click();
    await expect(page.getByText("2 series · 2 comentarios", { exact: true })).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
    expect(c.calls).toEqual([]);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`removal-${theme}-360.png`),
      fullPage: true,
    });
    c.lost = true;
    await page.getByRole("button", { name: "Eliminar para siempre", exact: true }).click();
    await expect(page.getByLabel("Estado de eliminación", { exact: true })).toHaveText(
      "Pendiente de confirmar en el servidor",
    );
    await page.reload();
    await enterWeekUser(page);
    await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
    await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Revisar eliminación", exact: true }).click();
    await page
      .getByRole("button", { name: "Reintentar la misma eliminación", exact: true })
      .click();
    await expect(page.getByText("Entrenamiento eliminado", { exact: true })).toBeVisible();
    expect(c.calls).toHaveLength(2);
    expect(c.calls[0]).toEqual(c.calls[1]);
    expect(
      JSON.parse((await page.evaluate((k) => localStorage.getItem(k), key))!).pending,
    ).toBeNull();
    await expect(page.getByRole("button", { name: "Ver resultado", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Volver a mi semana", exact: true }).click();
    await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
    await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeEnabled();
  });
}
test("corrección pendiente impide eliminar y conserva texto; cancelar vista no crea intento", async ({
  page,
}) => {
  const c = await setupRemoval(page);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  await openResultOptions(page);
  await page.getByRole("button", { name: "Eliminar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(c.calls).toEqual([]);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  await openResultOptions(page);
  await page.getByRole("button", { name: "Corregir entrenamiento", exact: true }).click();
  await page.getByLabel("Repeticiones de serie 1", { exact: true }).fill("9");
  await expect(page.getByLabel("Estado de corrección", { exact: true })).toHaveText(
    "Guardado en este dispositivo",
  );
  await page.getByRole("button", { name: "Volver sin descartar", exact: true }).click();
  await openResultOptions(page);
  await page.getByRole("button", { name: "Eliminar entrenamiento", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Eliminar para siempre", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retomar corrección", exact: true }).click();
  await expect(page.getByLabel("Repeticiones de serie 1", { exact: true })).toHaveValue("9");
  expect(c.calls).toEqual([]);
});
test("conflicto requiere consultar y aceptar nueva versión antes de otro intento", async ({
  page,
}) => {
  const c = await setupRemoval(page);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  await openResultOptions(page);
  await page.getByRole("button", { name: "Eliminar entrenamiento", exact: true }).click();
  await expect(page.getByText("2 series · 2 comentarios", { exact: true })).toBeVisible();
  c.conflict = true;
  c.correction.base.workout.revision = 9;
  await page.getByRole("button", { name: "Eliminar para siempre", exact: true }).click();
  await page.getByRole("button", { name: "Revisar versión actual", exact: true }).click();
  await expect(page.getByText("Revisión 9", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Aceptar versión actual", exact: true }).click();
  expect(c.calls).toHaveLength(1);
  c.conflict = false;
  await page.getByRole("button", { name: "Eliminar para siempre", exact: true }).click();
  await expect(page.getByText("Entrenamiento eliminado", { exact: true })).toBeVisible();
  expect(c.calls[1].expectedRevision).toBe(9);
  expect(c.calls[1].requestId).not.toBe(c.calls[0].requestId);
});
test("cuota al congelar impide HTTP y después del commit solo reintenta limpieza", async ({
  page,
}) => {
  const c = await setupRemoval(page);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  await openResultOptions(page);
  await page.getByRole("button", { name: "Eliminar entrenamiento", exact: true }).click();
  await page.evaluate((k) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === k && !localStorage.getItem("allow-removal")) throw Error("quota");
      return set.call(this, key, value);
    };
  }, key);
  await page.getByRole("button", { name: "Eliminar para siempre", exact: true }).click();
  await expect(page.getByLabel("Estado de eliminación", { exact: true })).toHaveText(
    "Cambios pendientes de guardar en este dispositivo",
  );
  expect(c.calls).toEqual([]);
  await page.evaluate(() => localStorage.setItem("allow-removal", "1"));
  await page
    .getByRole("button", { name: "Guardar intento en este dispositivo", exact: true })
    .click();
  c.beforeReply = async () => {
    await page.evaluate(() => localStorage.removeItem("allow-removal"));
  };
  await page.getByRole("button", { name: "Reintentar la misma eliminación", exact: true }).click();
  await expect(
    page
      .getByText(/El servidor confirmó la eliminación, pero falta/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page.evaluate(() => localStorage.setItem("allow-removal", "1"));
  await page.getByRole("button", { name: "Completar limpieza local", exact: true }).click();
  await expect(page.getByText("Entrenamiento eliminado", { exact: true })).toBeVisible();
  expect(c.calls).toHaveLength(1);
});
