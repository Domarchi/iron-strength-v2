import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { setupDownloadedWeek } from "./support/week-fixture";

const origin = "https://iron-strength-seven.vercel.app/api/mobile/v1";
const id1 = "11111111-1111-4111-8111-111111111111";

for (const theme of ["dark", "light"] as const)
  test(`medidas corporales: guardar, confirmar reemplazo y eliminar · ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    let items = [
      {
        id: id1,
        measuredOn: "2026-10-01",
        weightKg: 82,
        waistCm: 85.5,
        chestCm: null,
        armCm: null,
      },
    ];
    const posts: unknown[] = [];
    let exists = true,
      deleted: unknown = null;
    await page.route(origin + "/measurements/delete", async (route) => {
      deleted = route.request().postDataJSON();
      items = items.filter((m) => m.id !== (deleted as { id: string }).id);
      await route.fulfill({ json: { version: 1, ok: true } });
    });
    await page.route(origin + "/measurements", async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        posts.push(body);
        if (exists && !body.replace)
          return route.fulfill({
            status: 409,
            json: {
              version: 1,
              error: { code: "exists", message: "Ya tienes medidas para esa fecha." },
            },
          });
        items = [{ id: "22222222-2222-4222-8222-222222222222", ...body.measurement }, ...items];
        return route.fulfill({
          json: { version: 1, status: body.replace ? "replaced" : "created" },
        });
      }
      return route.fulfill({ json: { version: 1, items } });
    });
    await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
    await page.getByRole("button", { name: "Medidas corporales", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Medidas corporales" })).toBeVisible();
    await expect(page.getByLabel("Medidas del 2026-10-01", { exact: true })).toContainText(
      "82 kg · 85,5 cm cintura",
    );
    // Validación local antes de enviar.
    await page.getByRole("button", { name: "Guardar medidas", exact: true }).click();
    await expect(page.getByText("Ingresa al menos una medida.")).toBeVisible();
    expect(posts).toHaveLength(0);
    await page.getByRole("textbox", { name: "Peso (kg)", exact: true }).fill("80,5");
    await page.getByRole("button", { name: "Guardar medidas", exact: true }).click();
    await expect(page.getByText("Ya tienes medidas de hoy")).toBeVisible();
    // Conserva lo escrito y pide confirmación explícita.
    await expect(page.getByRole("textbox", { name: "Peso (kg)", exact: true })).toHaveValue("80,5");
    expect((posts[0] as { replace: boolean }).replace).toBe(false);
    exists = false;
    await page.getByRole("button", { name: "Reemplazar medidas de hoy", exact: true }).click();
    await expect(page.getByText("Medidas reemplazadas.")).toBeVisible();
    expect((posts[1] as { replace: boolean; measurement: { weightKg: number } }).replace).toBe(
      true,
    );
    expect((posts[1] as { measurement: { weightKg: number } }).measurement.weightKg).toBe(80.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await page
      .getByRole("button", { name: "Eliminar medidas del 2026-10-01", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "¿Eliminar estas medidas?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect(deleted).toBeNull();
    await page
      .getByRole("button", { name: "Eliminar medidas del 2026-10-01", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "¿Eliminar estas medidas?" })
      .getByRole("button", { name: "Eliminar", exact: true })
      .click();
    await expect.poll(() => deleted).toEqual({ version: 1, id: id1 });
    await expect(page.getByLabel("Medidas del 2026-10-01", { exact: true })).toHaveCount(0);
  });
