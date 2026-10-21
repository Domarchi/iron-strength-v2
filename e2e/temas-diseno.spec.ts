import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { COACH, resetAll, seedCoach, seedProgram } from "./support/db";
import { login } from "./support/ui";

test("tema manual persiste, Sistema vuelve a seguir el teléfono y las pantallas son legibles", async ({
  page,
}) => {
  await resetAll();
  const id = await seedCoach();
  await seedProgram({ coachId: id, studentId: id });
  await page.emulateMedia({ colorScheme: "light" });
  await login(page, COACH.email, COACH.password);
  await page.goto("/account");
  const theme = page.getByRole("combobox", { name: "Tema visual", exact: true });
  await expect(theme).toHaveValue("system");
  for (const value of ["dark", "light"] as const) {
    await theme.selectOption(value);
    await expect(page.locator("html")).toHaveAttribute("data-theme-preference", value);
    await page.reload();
    await expect(theme).toHaveValue(value);
    for (const path of ["/account", "/history", "/progress"]) {
      await page.goto(path);
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(0);
    }
    await page.goto("/account");
  }
  await theme.selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.screenshot({ path: test.info().outputPath("cuenta-clara.png"), fullPage: true });
});

test("el tema se aplica temporalmente cuando el dispositivo no permite guardar la preferencia", async ({
  page,
}) => {
  await resetAll();
  await seedCoach();
  await login(page, COACH.email, COACH.password);
  await page.goto("/account");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Sin espacio", "QuotaExceededError");
    };
  });
  await page.getByRole("combobox", { name: "Tema visual", exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    page.getByRole("alert").filter({ hasText: "No se pudo guardar el tema" }),
  ).toBeVisible();
});
