import { expect, test } from "@playwright/test";
import { setupRemoval } from "./support/removal-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
for (const family of ["correction", "removal"] as const) {
  test(`cuota al salir sin propuesta: recuperar ${family} no elimina entrenamientos`, async ({
    page,
  }) => {
    const c = await setupRemoval(page);
    await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
    await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeEnabled();
    const key = `is:workout-${family}:v1:${downloadId(1)}`;
    await page.evaluate((key) => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === key && !localStorage.getItem("allow-empty-exit")) throw Error("quota");
        return set.call(this, k, v);
      };
    }, key);
    await page.getByRole("button", { name: "Salir", exact: true }).click();
    await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Reintentar", exact: true })).toBeVisible();
    await page.evaluate(() => localStorage.setItem("allow-empty-exit", "1"));
    await page.getByRole("button", { name: "Reintentar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Salir", exact: true }).click();
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
    expect(c.calls).toEqual([]);
    expect(c.correction.calls).toEqual([]);
  });
  test(`otra ventana con formato futuro: recuperar ${family} vacío conserva sus bytes`, async ({
    page,
  }) => {
    const c = await setupRemoval(page);
    await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
    await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeEnabled();
    const key = `is:workout-${family}:v1:${downloadId(1)}`;
    await page.evaluate((key) => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === key && !localStorage.getItem("allow-empty-exit")) throw Error("quota");
        return set.call(this, k, v);
      };
    }, key);
    await page.getByRole("button", { name: "Salir", exact: true }).click();
    await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
    await page.evaluate((key) => {
      localStorage.setItem("allow-empty-exit", "1");
      localStorage.setItem(key, '{"version":99}');
    }, key);
    const label = family === "correction" ? "corrección" : "eliminación";
    await expect(
      page.getByRole("button", { name: `Releer ${label} local`, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: `Releer ${label} local`, exact: true }).click();
    await expect(page.getByText(/Se reemplazará/)).toBeVisible();
    await page
      .getByRole("button", { name: `Confirmar relectura de ${label}`, exact: true })
      .click();
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe('{"version":99}');
    await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
    await page.evaluate(
      ({ key, user, family }) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            userId: user,
            ...(family === "correction" ? { draft: null } : {}),
            pending: null,
          }),
        ),
      { key, user: downloadId(1), family },
    );
    await page.getByRole("button", { name: `Releer ${label} local`, exact: true }).click();
    await page
      .getByRole("button", { name: `Confirmar relectura de ${label}`, exact: true })
      .click();
    await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeEnabled();
    expect(c.calls).toEqual([]);
    expect(c.correction.calls).toEqual([]);
  });
}
