import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  ["/privacy", "Privacidad"],
  ["/support", "Ayuda"],
  ["/delete-account", "Eliminar tu cuenta"],
] as const;

test("información pública sin sesión, sin cookies nuevas y sin operaciones de escritura", async ({
  page,
  context,
  request,
}) => {
  await context.addCookies([
    { name: "sb-test-auth-token", value: "invalid", url: "http://127.0.0.1:3100" },
  ]);
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method()))
      writes.push(r.method() + " " + new URL(r.url()).pathname);
  });
  for (const [path, title] of pages) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["set-cookie"]).toBeUndefined();
    await expect(page.getByRole("heading", { name: title, exact: true, level: 1 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "joaquindomarchi@gmail.com", exact: true }).first(),
    ).toHaveAttribute("href", /^mailto:joaquindomarchi@gmail\.com/);
    await expect(page.getByRole("button", { name: /borrar|eliminar|enviar/i })).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: "Redactar solicitud por correo" })).toHaveAttribute(
    "href",
    /^mailto:joaquindomarchi@gmail\.com\?subject=/,
  );
  await expect(
    page.getByText("La solicitud no se envía hasta que tú la envíes desde tu correo."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ir a Mi cuenta" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page
    .getByRole("navigation", { name: "Privacidad y ayuda" })
    .getByRole("link", { name: "Ayuda", exact: true })
    .click();
  await expect(page).toHaveURL(/\/support$/);
  expect(writes).toEqual([]);
  for (const path of ["/privacy/private", "/supportx", "/delete-account/confirm", "/account"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toMatch(/\/login$/);
  }
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`información pública ${scheme}`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 360, height: 800 } });
    test("legible a 360 px, teclado y WCAG AA", async ({ page }) => {
      for (const [path] of pages) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveClass(scheme === "dark" ? /dark/ : /^(?!.*dark)/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.keyboard.press("Tab");
        await expect(page.getByRole("link", { name: "Ir al contenido" })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("main")).toBeFocused();
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(
          result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
        ).toEqual([]);
        await page.screenshot({
          path: test.info().outputPath(`${path.slice(1)}-${scheme}.png`),
          fullPage: true,
        });
        for (const link of await page
          .getByRole("navigation", { name: "Privacidad y ayuda" })
          .getByRole("link")
          .all()) {
          const box = await link.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
        }
      }
    });
  });
}
