import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const theme of ["dark", "light"]) {
  test(`${theme}: comparación contiene seis imágenes originales y enlaces funcionales`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/comparison.html?view=home&theme=${theme}`);
    for (const view of ["home", "workout", "routine"]) {
      await page.getByRole("combobox", { name: "Pantalla", exact: true }).selectOption(view);
      for (const id of ["before", "after"]) {
        const image = page.locator(`#${id}`);
        await expect
          .poll(() =>
            image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth),
          )
          .toBe(390);
        const target = await page.locator(`#${id}-link`).getAttribute("href");
        expect(target).toContain(`${theme}-${view}.png`);
      }
      await expect(
        page.getByRole("link", { name: "Probar la propuesta interactiva →", exact: true }),
      ).toHaveAttribute("href", `./prototype/index.html?view=${view}&theme=${theme}`);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
