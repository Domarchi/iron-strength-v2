import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { admin, COACH, resetAll, seedCoach, seedProgram } from "./support/db";
import { login } from "./support/ui";
async function auditMobile(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "a[href],button,input:not([type=hidden]),textarea,select,summary",
      ),
    ].flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1 || getComputedStyle(element).visibility === "hidden")
        return [];
      const target = element.matches('input[type="checkbox"],input[type="radio"]')
        ? (element.closest("label") ?? element)
        : element;
      const box = target.getBoundingClientRect();
      return box.width >= 44 && box.height >= 44
        ? []
        : [
            {
              name: (
                element.getAttribute("aria-label") ??
                element.textContent ??
                element.tagName
              ).slice(0, 80),
              width: box.width,
              height: box.height,
            },
          ];
    }),
  );
  expect(small).toEqual([]);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
}
for (const scheme of ["light", "dark"] as const)
  test(`360 px, textos largos, foco, teclado y formularios en modo ${scheme} (T163)`, async ({
    page,
  }) => {
    await resetAll();
    const coachId = await seedCoach();
    const template = await seedProgram({ coachId, studentId: coachId });
    expect(
      (
        await admin()
          .from("programs")
          .update({
            student_id: null,
            start_date: null,
            ends_on: null,
            name: "Rutina" + "A".repeat(80),
          })
          .eq("id", template.programId)
      ).error,
    ).toBeNull();
    const own = await seedProgram({ coachId, studentId: coachId });
    expect(
      (
        await admin()
          .from("program_sessions")
          .update({ title: "Fuerza" + "B".repeat(65) })
          .eq("id", own.sessionId)
      ).error,
    ).toBeNull();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await login(page, COACH.email, COACH.password);
    await page.goto("/week");
    await auditMobile(page);
    await page.goto(`/coach/programs/${template.programId}`);
    await auditMobile(page);
    const field = page.getByLabel("Series de Sentadilla", { exact: true });
    await expect(field).toHaveCSS("font-size", "16px");
    await field.focus();
    await expect(field).toBeFocused();
    const nativeDialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      nativeDialogs.push(dialog.message());
      await dialog.accept();
    });
    await field.fill("4");
    await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    const exit = page.getByRole("dialog", { name: "Antes de cerrar sesión", exact: true });
    await expect(exit).toBeVisible();
    expect(nativeDialogs).toEqual([]);
    await auditMobile(page);
    await exit.getByRole("button", { name: "Volver sin cerrar sesión", exact: true }).click();
    await expect(field).toHaveValue("4");
    await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
    await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
    await page.goto(`/workout/${own.sessionId}`);
    await auditMobile(page);
    await expect(page.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toHaveAttribute(
      "inputmode",
      "decimal",
    );
    await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("60");
    await page
      .getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla", exact: true })
      .click();
    await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await auditMobile(page);
    await expect(page.getByLabel("Nota del entrenamiento (opcional)", { exact: true })).toHaveCSS(
      "font-size",
      "16px",
    );
    const duration = await page
      .getByRole("button", { name: "Sí, finalizar", exact: true })
      .evaluate((el) => getComputedStyle(el).transitionDuration.split(",").map(parseFloat));
    expect(duration.every((seconds) => seconds <= 0.001)).toBe(true);
    await page.screenshot({ path: `test-results/acabado-${scheme}.png`, fullPage: true });
  });
