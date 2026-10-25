import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const origin = "https://iron-strength-seven.vercel.app";
const invite = "a".repeat(43),
  recovery = "b".repeat(56);
async function fields(page: Page) {
  await page.getByLabel("Contraseña nueva", { exact: true }).fill("Clave-prueba-192");
  await page.getByLabel("Repite la contraseña", { exact: true }).fill("Clave-prueba-192");
}
for (const theme of ["light", "dark"] as const) {
  test(`invitación móvil ${theme}: revisar sin consumir, crear y volver sin token o credenciales persistidos`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const seen: string[] = [];
    await page.route(origin + "/api/mobile/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      seen.push(path);
      await route.fulfill({
        json: path.endsWith("invitation")
          ? { version: 1, status: "valida", email: "ana@example.test" }
          : { version: 1, ok: true, email: "ana@example.test" },
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Tengo un enlace de mi coach", exact: true }).click();
    await page.getByLabel("Enlace de tu coach", { exact: true }).fill(origin + "/invite/" + invite);
    await page.getByRole("button", { name: "Revisar enlace", exact: true }).click();
    await expect(page.getByText("ana@example.test", { exact: true })).toBeVisible();
    expect(seen).toEqual(["/api/mobile/v1/auth/invitation"]);
    await page.getByLabel("Tu nombre", { exact: true }).fill("Ana");
    await fields(page);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`invitation-${theme}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Crear mi cuenta", exact: true }).click();
    await expect(page.getByText(/Tu cuenta está lista/)).toBeVisible();
    await expect(page).toHaveURL(/\/login\?reason=registered$/);
    expect(page.url()).not.toContain(invite);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(seen).toEqual(["/api/mobile/v1/auth/invitation", "/api/mobile/v1/auth/register"]);
  });
}
test("recuperación por enlace verifica al enviar, rechaza confirmación y ofrece salida para enlace usado", async ({
  page,
}) => {
  const sent: string[] = [];
  await page.route(origin + "/api/mobile/v1/**", async (route) => {
    sent.push(route.request().url());
    await route.fulfill({
      status: 410,
      json: {
        version: 1,
        error: {
          code: "invalid_link",
          message: "El enlace venció o ya fue usado. Pídele otro a tu coach.",
        },
      },
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto(`/access?kind=reset&token=${recovery}`);
  await expect(page.getByText("Nueva contraseña", { exact: true })).toBeVisible();
  expect(sent).toHaveLength(0);
  await fields(page);
  await page.getByLabel("Repite la contraseña", { exact: true }).fill("Diferente");
  await page.getByRole("button", { name: "Guardar contraseña nueva", exact: true }).click();
  await expect(page.getByText("Las contraseñas no coinciden.", { exact: true })).toBeVisible();
  expect(sent).toHaveLength(0);
  await fields(page);
  await page.getByRole("button", { name: "Guardar contraseña nueva", exact: true }).click();
  await expect(
    page.getByText("El enlace venció o ya fue usado. Pídele otro a tu coach.", { exact: true }),
  ).toBeVisible();
  expect(sent).toHaveLength(1);
  await page.getByRole("button", { name: "Volver a iniciar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test("recuperación correcta no persiste su token y entrada externa no toca la API", async ({
  page,
}) => {
  const sent: string[] = [];
  await page.route(origin + "/api/mobile/v1/**", async (route) => {
    sent.push(route.request().url());
    await route.fulfill({
      json: { version: 1, ok: true },
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto("/access");
  await page
    .getByLabel("Enlace de tu coach", { exact: true })
    .fill("https://evil.test/reset/" + recovery);
  await page.getByRole("button", { name: "Revisar enlace", exact: true }).click();
  await expect(
    page.getByText("Usa un enlace válido de Iron Strength entregado por tu coach.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(sent).toHaveLength(0);
  await page.getByLabel("Enlace de tu coach", { exact: true }).fill(origin + "/reset/" + recovery);
  await page.getByRole("button", { name: "Revisar enlace", exact: true }).click();
  await fields(page);
  await page.getByRole("button", { name: "Guardar contraseña nueva", exact: true }).click();
  await expect(page.getByText(/Contraseña actualizada/)).toBeVisible();
  expect(page.url()).not.toContain(recovery);
  expect(sent).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
