import { expect, test } from "@playwright/test";
import { setupDownloadedWeek } from "./support/week-fixture";

test("ajuste rápido sube y baja el peso de la serie en curso sin teclado", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setupDownloadedWeek(page);
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  const weight = page.getByRole("textbox", { name: "KG serie 1", exact: true });
  await expect(weight).toHaveValue("55");
  const up = page.getByRole("button", { name: "Subir 2,5 kg serie 1", exact: true });
  expect((await up.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await up.click();
  await expect(weight).toHaveValue("57,5");
  await page.getByRole("button", { name: "Bajar 2,5 kg serie 1", exact: true }).click();
  await page.getByRole("button", { name: "Bajar 2,5 kg serie 1", exact: true }).click();
  await expect(weight).toHaveValue("52,5");
  // Superserie: al completar la serie 1 el foco pasa a Remo y el ajuste sigue en su serie 1.
  await page.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("8");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "KG serie 1", exact: true })).toHaveValue("40");
  await page.getByRole("button", { name: "Subir 2,5 kg serie 1", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "KG serie 1", exact: true })).toHaveValue("42,5");
});
